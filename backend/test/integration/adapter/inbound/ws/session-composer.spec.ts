import { mkdirSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Envelope } from '@remote-claude/contracts';

import { AttachmentStore } from '@application/session';
import { MENTION_GUARD } from '@domain/session';
import { QUERY_FACTORY } from '@adapter/outbound/claude/query.factory';
import type { QueryFactory } from '@adapter/outbound/claude/query.factory';
import { TRANSCRIPT_SDK } from '@adapter/outbound/claude/transcript-sdk';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import type { ScriptOptions, ScriptRecord } from '../../../../fakes/agent-sdk/scripted-query';
import { ScriptedTranscripts } from '../../../../fakes/agent-sdk/scripted-transcripts';
import { startPostgres } from '../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../support/app/test-app';
import type { TestApp } from '../../../../support/app/test-app';
import { commandFrame, TestSocket } from '../../../../support/app/ws-client';

/** The ceiling of an attachment in this suite: small, so "one byte past it" is cheap to send. */
const CEILING = 2_048;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

/**
 * The composer of the panel, over the real gateway and the real HTTP surface — plan 08, F5: the
 * context of a prompt checked in the session's folder and composed for Claude (B-44), the
 * attachments uploaded beside it (B-45), and the catalogue a draft reads before a session (B-50).
 */
describe('the composer of the panel', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let root: string;
  let token: string;
  let stranger: string;
  let store: ScriptedTranscripts;
  let script: ScriptOptions;
  let workspace: string;
  const records: ScriptRecord[] = [];
  const open: TestSocket[] = [];

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    const allowlist = writeTestAllowlist([SUBJECT]);
    root = allowlist.root;

    const createQuery: QueryFactory = (params) => {
      const sdk = scriptedSdk({ ...script, transcripts: store });
      records.push(sdk.record);
      return sdk.createQuery(params);
    };

    harness = await startTestApp(
      database.url,
      identity,
      (builder) =>
        builder
          .overrideProvider(QUERY_FACTORY)
          .useValue(createQuery)
          .overrideProvider(TRANSCRIPT_SDK)
          .useValue({
            listSessions: (options: never) => store.listSessions(options),
            getSessionInfo: (id: string) => store.getSessionInfo(id),
            getSessionMessages: (id: string) => store.getSessionMessages(id),
          }),
      allowlist,
      {
        RC_SESSION_MAX_CONCURRENT: '32',
        RC_ATTACHMENT_MAX_BYTES: String(CEILING),
        RC_ATTACHMENT_MEMORY_BYTES: '65536',
      },
    );
    token = await identity.accessToken({ subject: SUBJECT });
    stranger = await identity.accessToken({ subject: 'auth|stranger' });
  });

  afterAll(async () => {
    for (const socket of open) {
      socket.close();
    }
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  beforeEach(({ task }) => {
    workspace = path.join(root, task.id);
    mkdirSync(workspace, { recursive: true });
    writeFileSync(path.join(workspace, 'notes.md'), 'one\ntwo\nthree\n');
    mkdirSync(path.join(workspace, 'docs'));
    store = new ScriptedTranscripts();
    script = { fixture: 'text-turn' };
    records.length = 0;
  });

  async function connect(): Promise<TestSocket> {
    const socket = await TestSocket.open(harness.url);
    open.push(socket);
    socket.send(
      commandFrame('connection.authenticate', {
        token,
        locale: 'en',
        client: { kind: 'web', version: '0.0.0' },
      }),
    );
    await socket.next();
    return socket;
  }

  async function until(
    socket: TestSocket,
    found: (frame: Envelope) => boolean,
    limit = 600,
  ): Promise<Envelope> {
    for (let taken = 0; taken < limit; taken += 1) {
      const frame = await socket.next();
      if (found(frame)) {
        return frame;
      }
    }
    throw new Error(`nothing matched in ${String(limit)} frames`);
  }

  const ofType = (type: string) => (frame: Envelope) => frame.type === type;

  async function started(socket: TestSocket): Promise<string> {
    socket.send(commandFrame('session.start', { workspacePath: workspace }));
    const frame = await until(socket, ofType('session.started'));
    return String(frame.payload?.['sessionId']);
  }

  /** A prompt sent, and what answered it: its refusal, or its ack. */
  async function prompted(
    socket: TestSocket,
    sessionId: string,
    text: string,
    attachments: readonly Record<string, unknown>[],
  ): Promise<Envelope> {
    const command = commandFrame('session.prompt', { sessionId, text, attachments });
    socket.send(command);
    return until(
      socket,
      (frame) =>
        (frame.kind === 'error' || frame.kind === 'ack') && frame.correlationId === command['id'],
    );
  }

  const http = () => request(harness.app.getHttpServer());

  const upload = (sessionId: string, name: string, content: Buffer, as = token) =>
    http()
      .post(`/sessions/${sessionId}/attachments`)
      .set('Authorization', `Bearer ${as}`)
      .field('name', name)
      .attach('file', content, name);

  describe('references of files, folders and lines — B-44', () => {
    it('composes them for Claude, who reads the file under the hook, into the trail — S-197', async () => {
      const socket = await connect();
      const sessionId = await started(socket);

      const ack = await prompted(socket, sessionId, '[fixture:reference-turn] Summarise it', [
        { kind: 'file', path: 'notes.md', range: { startLine: 1, endLine: 2 } },
        { kind: 'folder', path: 'docs' },
      ]);
      await until(socket, ofType('turn.completed'));

      expect(ack.type).toBe('command.accepted');
      expect(records[0]?.prompts[0]).toBe(
        [
          '[fixture:reference-turn] Summarise it',
          '',
          '<reference path="notes.md" lines="1-2" />',
          '<reference path="docs" kind="folder" />',
        ].join('\n'),
      );
      expect(records[0]?.hooked).toContain('Read');

      const trail = await http()
        .get('/audit-entries')
        .query({ sessionId })
        .set('Authorization', `Bearer ${token}`);
      expect(
        (trail.body as { entries: { toolName: string }[] }).entries.map((entry) => entry.toolName),
      ).toContain('Read');
    });

    it('takes an absolute path inside the folder, and names it relative to it', async () => {
      const socket = await connect();
      const sessionId = await started(socket);

      await prompted(socket, sessionId, 'x', [{ path: path.join(workspace, 'notes.md') }]);
      await until(socket, ofType('turn.completed'));

      expect(records[0]?.prompts[0]).toContain('<reference path="notes.md" />');
    });

    it.each([
      ['a path that climbs out', '../elsewhere.md'],
      ['an absolute path of another folder', '/etc/passwd'],
    ])('refuses the whole prompt for %s — S-199', async (_case, outside) => {
      const socket = await connect();
      const sessionId = await started(socket);

      const refused = await prompted(socket, sessionId, 'x', [
        { path: 'notes.md' },
        { path: outside },
      ]);

      expect(refused.kind).toBe('error');
      expect(refused.payload).toMatchObject({ code: 'WORKSPACE_NOT_ALLOWED' });
      expect(records[0]?.prompts).toEqual([]);
    });

    it('refuses a link inside the folder that leads out of it — S-200', async () => {
      const outside = path.join(root, `${path.basename(workspace)}-outside`);
      mkdirSync(outside, { recursive: true });
      writeFileSync(path.join(outside, 'secret.txt'), 'secret');
      symlinkSync(path.join(outside, 'secret.txt'), path.join(workspace, 'link.txt'));
      const socket = await connect();
      const sessionId = await started(socket);

      const refused = await prompted(socket, sessionId, 'x', [{ path: 'link.txt' }]);

      expect(refused.payload).toMatchObject({ code: 'WORKSPACE_NOT_ALLOWED' });
      expect(records[0]?.prompts).toEqual([]);
    });

    it.each([
      ['a file that does not exist', { path: 'gone.md' }, 'FILE_NOT_FOUND', 'files.error.notFound'],
      [
        'a folder named as a file',
        { kind: 'file', path: 'docs' },
        'INVALID_INPUT',
        'session.error.referenceKind',
      ],
      [
        'a file named as a folder',
        { kind: 'folder', path: 'notes.md' },
        'INVALID_INPUT',
        'session.error.referenceKind',
      ],
      [
        'a binary that is not an image',
        { path: 'blob.bin' },
        'FILE_NOT_TEXT',
        'files.error.notText',
      ],
    ])('refuses %s — S-201', async (_case, attachment, code, messageKey) => {
      writeFileSync(path.join(workspace, 'blob.bin'), Buffer.from([1, 0, 2, 0, 3]));
      const socket = await connect();
      const sessionId = await started(socket);

      const refused = await prompted(socket, sessionId, 'x', [attachment]);

      expect(refused.payload).toMatchObject({ code, messageKey });
    });

    it('guards a mention typed by hand, so the CLI does not read the file without a Read — R-10', async () => {
      const socket = await connect();
      const sessionId = await started(socket);

      await prompted(socket, sessionId, 'what does @notes.md say', []);
      await until(socket, ofType('turn.completed'));

      expect(records[0]?.prompts[0]).toBe(`what does ${MENTION_GUARD}@notes.md say`);
    });

    it('logs the paths and the sizes of the context, never what it holds — S-204', async () => {
      const socket = await connect();
      const sessionId = await started(socket);
      const held = await upload(sessionId, 'notes.txt', Buffer.from('a private remark'));

      await prompted(socket, sessionId, 'look', [
        { path: 'notes.md' },
        { kind: 'upload', attachmentId: (held.body as { attachmentId: string }).attachmentId },
        { kind: 'text', source: 'terminal', label: 'terminal: bash', content: '$ secret-cmd' },
      ]);
      await until(socket, ofType('turn.completed'));

      const input = harness.log.withOp('claude.input').at(-1);
      expect(input).toMatchObject({
        prompt: 'look',
        context: [
          { kind: 'file', path: 'notes.md', bytes: 14 },
          { kind: 'upload', mediaType: 'text/plain', bytes: 16 },
          { kind: 'text', bytes: 12 },
        ],
      });
      const everything = JSON.stringify(harness.log.lines);
      expect(everything).not.toContain('a private remark');
      expect(everything).not.toContain('secret-cmd');
    });

    it('queues a prompt with context during a turn, and sends it whole after it — S-205', async () => {
      const socket = await connect();
      const sessionId = await started(socket);
      socket.send(commandFrame('session.prompt', { sessionId, text: '[hold] a long one' }));
      await until(socket, (frame) => frame.payload?.['status'] === 'thinking');

      await prompted(socket, sessionId, 'then this', [{ path: 'notes.md' }]);
      const queued = await until(socket, ofType('prompt.queued'));
      socket.send(commandFrame('session.interrupt', { sessionId }));
      // The interrupted turn completes first, and only then does the queue let the next one go.
      await until(socket, ofType('prompt.dequeued'));
      await until(socket, ofType('turn.completed'));

      expect(queued.payload).toMatchObject({ preview: 'then this' });
      expect(records[0]?.prompts[1]).toBe('then this\n\n<reference path="notes.md" />');
    });
  });

  describe('attachments uploaded — B-45', () => {
    it('sends an image as a block of image beside the text — S-206', async () => {
      const socket = await connect();
      const sessionId = await started(socket);

      const held = await upload(sessionId, 'shot.png', PNG);
      await prompted(socket, sessionId, 'what is it', [
        { kind: 'upload', attachmentId: (held.body as { attachmentId: string }).attachmentId },
      ]);
      await until(socket, ofType('turn.completed'));

      expect(held.status).toBe(201);
      expect(held.body).toMatchObject({ kind: 'image', mediaType: 'image/png', size: PNG.length });
      expect(JSON.parse(records[0]?.prompts[0] ?? '[]')).toEqual([
        { type: 'text', text: 'what is it' },
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: PNG.toString('base64') },
        },
      ]);
    });

    it('sends a text file delimited with its name, and never touches the folder — S-207, S-211', async () => {
      const socket = await connect();
      const sessionId = await started(socket);
      const before = readdirSync(workspace).sort();

      const held = await upload(sessionId, 'todo.txt', Buffer.from('buy milk'));
      await prompted(socket, sessionId, 'read it', [
        { kind: 'upload', attachmentId: (held.body as { attachmentId: string }).attachmentId },
      ]);
      await until(socket, ofType('turn.completed'));

      expect(records[0]?.prompts[0]).toBe(
        'read it\n\n<context source="upload" label="todo.txt">\nbuy milk\n</context>',
      );
      expect(readdirSync(workspace).sort()).toEqual(before);
      expect(JSON.stringify(harness.log.withOp('session.attachment'))).not.toContain('buy milk');
      expect(harness.log.withOp('session.attachment').at(-1)).toMatchObject({
        kind: 'text',
        bytes: 8,
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown,
      });
    });

    it('takes an attachment exactly at the ceiling, and refuses one byte past it — S-208', async () => {
      const socket = await connect();
      const sessionId = await started(socket);

      const at = await upload(sessionId, 'a.txt', Buffer.alloc(CEILING, 0x61));
      const past = await upload(sessionId, 'b.txt', Buffer.alloc(CEILING + 1, 0x62));

      expect(at.status).toBe(201);
      expect(past.status).toBe(413);
      expect((past.body as { error: unknown }).error).toMatchObject({
        code: 'PAYLOAD_TOO_LARGE',
        messageKey: 'session.error.attachmentTooLarge',
        params: { limit: CEILING },
      });
    });

    it.each([
      [
        'an SVG',
        'x.svg',
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
        'image/svg+xml',
      ],
      ['a PDF', 'x.pdf', Buffer.from('%PDF-1.4\n'), 'application/pdf'],
      ['a binary', 'x.bin', Buffer.from([1, 0, 2]), 'application/octet-stream'],
    ])('refuses %s — S-209', async (_case, name, content, mediaType) => {
      const socket = await connect();
      const sessionId = await started(socket);

      const refused = await upload(sessionId, name, content);

      expect(refused.status).toBe(415);
      expect((refused.body as { error: unknown }).error).toMatchObject({
        code: 'ATTACHMENT_TYPE_UNSUPPORTED',
        params: { mediaType },
      });
    });

    it('refuses a prompt naming an attachment unknown, or of another session — S-210', async () => {
      const socket = await connect();
      const first = await started(socket);
      const second = await started(socket);
      const held = await upload(first, 'a.txt', Buffer.from('a'));
      const id = (held.body as { attachmentId: string }).attachmentId;

      const unknown = await prompted(socket, first, 'x', [
        { kind: 'upload', attachmentId: 'att_x' },
      ]);
      const elsewhere = await prompted(socket, second, 'x', [{ kind: 'upload', attachmentId: id }]);

      for (const refused of [unknown, elsewhere]) {
        expect(refused.payload).toMatchObject({ code: 'ATTACHMENT_NOT_FOUND' });
      }
    });

    it('lets go of what a session held when it closes — S-212', async () => {
      const socket = await connect();
      const sessionId = await started(socket);
      await upload(sessionId, 'a.txt', Buffer.from('held for a while'));
      const attachments = harness.app.get(AttachmentStore);
      const before = attachments.heldBytes;

      socket.send(commandFrame('session.close', { sessionId }));
      await until(socket, ofType('session.closed'));

      expect(before).toBeGreaterThan(0);
      expect(attachments.heldBytes).toBe(before - 'held for a while'.length);
    });

    it('answers the same id for the same upload sent again — S-213', async () => {
      const socket = await connect();
      const sessionId = await started(socket);

      const first = await upload(sessionId, 'a.txt', Buffer.from('same bytes'));
      const again = await upload(sessionId, 'a.txt', Buffer.from('same bytes'));

      expect((again.body as { attachmentId: string }).attachmentId).toBe(
        (first.body as { attachmentId: string }).attachmentId,
      );
    });

    it('names an attachment sent without its name `attachment`', async () => {
      const socket = await connect();
      const sessionId = await started(socket);

      const held = await http()
        .post(`/sessions/${sessionId}/attachments`)
        .set('Authorization', `Bearer ${token}`)
        .attach('file', Buffer.from('nameless'), 'x.txt');

      expect(held.status).toBe(201);
      expect(held.body).toMatchObject({ name: 'attachment', kind: 'text' });
    });

    it("refuses an upload without a file, and one to somebody else's session", async () => {
      const socket = await connect();
      const sessionId = await started(socket);

      const empty = await http()
        .post(`/sessions/${sessionId}/attachments`)
        .set('Authorization', `Bearer ${token}`)
        .field('name', 'x');
      const theirs = await upload(sessionId, 'a.txt', Buffer.from('a'), stranger);

      expect(empty.status).toBe(400);
      expect(theirs.status).toBe(403);
    });
  });

  describe('the catalogue before a session — B-50', () => {
    const catalog = (folder: string) =>
      http()
        .get('/catalog')
        .query({ workspacePath: folder })
        .set('Authorization', `Bearer ${token}`);

    it('answers the commands with their origin, the models and the ceilings, from one query that only asks — S-241, S-244', async () => {
      const first = await catalog(workspace);
      const again = await catalog(workspace);

      expect(first.status).toBe(200);
      const body = first.body as {
        commands: { name: string; origin: string; label: string; shadowed: boolean }[];
        models: unknown[];
        limits: Record<string, unknown>;
      };
      expect(body.commands.find((command) => command.name === 'init')).toMatchObject({
        origin: 'builtin',
        label: 'init',
        shadowed: false,
      });
      expect(body.models.length).toBeGreaterThan(0);
      expect(body.limits).toMatchObject({
        attachmentMaxBytes: CEILING,
        contextWarnFraction: 0.25,
        draftWindowTokens: 200_000,
      });
      expect(again.body).toEqual(first.body);
      expect(records).toHaveLength(1);
      expect(records[0]?.prompts).toEqual([]);
      expect(records[0]?.closes).toBe(1);
    });

    it('makes one query for two drafts asking together — S-245', async () => {
      const [first, second] = await Promise.all([catalog(workspace), catalog(workspace)]);

      expect(first.status).toBe(200);
      expect(second.body).toEqual(first.body);
      expect(records).toHaveLength(1);
    });

    it('refuses a folder outside the allowlist, before anything runs', async () => {
      const refused = await catalog('/etc');

      expect(refused.status).toBe(403);
      expect(records).toHaveLength(0);
    });

    it('says the origin in the menu of a live session too — S-241', async () => {
      const socket = await connect();
      const sessionId = await started(socket);

      const menu = await http()
        .get(`/sessions/${sessionId}/commands`)
        .set('Authorization', `Bearer ${token}`);

      expect(
        (menu.body as { commands: { origin: string }[] }).commands.every(
          (command) => typeof command.origin === 'string',
        ),
      ).toBe(true);
    });
  });
});
