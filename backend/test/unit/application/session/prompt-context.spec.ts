import { describe, expect, it } from 'vitest';

import { AttachmentStore, PromptContextResolver } from '@application/session';
import type { LiveSession } from '@application/session';
import { FileNotFoundError } from '@domain/files';
import { AttachmentNotFoundError, MENTION_GUARD } from '@domain/session';
import { WorkspaceNotAllowedError } from '@domain/workspace';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { ScriptedReferenceInspector } from '../../../support/fakes/scripted-reference-inspector';
import {
  aConversation,
  aSession,
  RecordingHandle,
  SESSION_ID,
} from '../../../support/builders/session.builder';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

function setup() {
  const inspector = new ScriptedReferenceInspector();
  const store = new AttachmentStore(new FixedClock(new Date('2026-10-02T12:00:00.000Z')), {
    ttlMs: 60_000,
    memoryBytes: 1024 * 1024,
  });
  const live: LiveSession = {
    session: aSession({ workspace: '/srv/projects/app' }),
    handle: new RecordingHandle(),
    conversation: aConversation(),
  };
  const keep = (name: string, bytes: Uint8Array, kind: 'image' | 'text', mediaType: string) =>
    store.keep(
      SESSION_ID,
      { kind, mediaType, name, size: bytes.length, sha256: name, bytes },
      `att_${name}`,
    );

  return { inspector, store, live, keep, resolver: new PromptContextResolver(inspector, store) };
}

describe('PromptContextResolver — plan 08, B-44, B-45', () => {
  it('sends the text alone, guarded, and nothing beside it, without context', async () => {
    const { resolver, live } = setup();

    expect(await resolver.resolve(live, '@a.ts?', [])).toEqual({
      text: `${MENTION_GUARD}@a.ts?`,
    });
  });

  it('checks every reference in the session folder, and composes them — S-197, S-198', async () => {
    const { resolver, live, inspector } = setup();

    const outgoing = await resolver.resolve(live, 'explain', [
      { path: 'src/a.ts' },
      { kind: 'file', path: 'src/b.ts', range: { startLine: 3, endLine: 7 } },
      { kind: 'folder', path: 'docs' },
    ]);

    expect(inspector.asked).toEqual([
      { workspace: '/srv/projects/app', raw: 'src/a.ts', kind: 'file' },
      { workspace: '/srv/projects/app', raw: 'src/b.ts', kind: 'file' },
      { workspace: '/srv/projects/app', raw: 'docs', kind: 'folder' },
    ]);
    expect(outgoing.text).toBe(
      [
        'explain',
        '',
        '<reference path="src/a.ts" />',
        '<reference path="src/b.ts" lines="3-7" />',
        '<reference path="docs" kind="folder" />',
      ].join('\n'),
    );
    expect(outgoing.extras?.context).toEqual([
      { kind: 'file', path: 'src/a.ts', bytes: 8 },
      { kind: 'file', path: 'src/b.ts', lines: '3-7', bytes: 8 },
      { kind: 'folder', path: 'docs' },
    ]);
  });

  it('names the folder itself as `.`', async () => {
    const { resolver, live } = setup();

    const outgoing = await resolver.resolve(live, 'x', [{ kind: 'folder', path: '' }]);

    expect(outgoing.text).toContain('<reference path="." kind="folder" />');
  });

  it('refuses the whole prompt with the first refusal, in the order chosen — S-199', async () => {
    const { resolver, live, inspector } = setup();
    inspector.refuse('gone.ts', new FileNotFoundError('gone.ts'));
    inspector.refuse('../x', new WorkspaceNotAllowedError('/srv/projects/x'));

    await expect(
      resolver.resolve(live, 'x', [{ path: 'ok.ts' }, { path: '../x' }, { path: 'gone.ts' }]),
    ).rejects.toBeInstanceOf(WorkspaceNotAllowedError);
  });

  it('sends a text of a provider delimited and labelled, and logs only its size — S-203', async () => {
    const { resolver, live } = setup();

    const outgoing = await resolver.resolve(live, 'why', [
      { kind: 'text', source: 'terminal', label: 'terminal: bash', content: 'secret output' },
    ]);

    expect(outgoing.text).toContain(
      '<context source="terminal" label="terminal: bash">\nsecret output\n</context>',
    );
    expect(outgoing.extras?.context).toEqual([{ kind: 'text', bytes: 13 }]);
    expect(JSON.stringify(outgoing.extras?.context)).not.toContain('secret');
  });

  it('puts an uploaded image beside the text, and a text upload in it — S-206, S-207', async () => {
    const { resolver, live, keep } = setup();
    keep('shot.png', PNG, 'image', 'image/png');
    keep('notes.txt', new TextEncoder().encode('remember this'), 'text', 'text/plain');

    const outgoing = await resolver.resolve(live, 'look', [
      { kind: 'upload', attachmentId: 'att_shot.png' },
      { kind: 'upload', attachmentId: 'att_notes.txt' },
    ]);

    expect(outgoing.extras?.images).toEqual([
      { mediaType: 'image/png', data: Buffer.from(PNG).toString('base64') },
    ]);
    expect(outgoing.text).toContain(
      '<context source="upload" label="notes.txt">\nremember this\n</context>',
    );
    expect(outgoing.extras?.context).toEqual([
      { kind: 'upload', mediaType: 'image/png', bytes: 9, sha256: 'shot.png' },
      { kind: 'upload', mediaType: 'text/plain', bytes: 13, sha256: 'notes.txt' },
    ]);
    expect(outgoing.extras?.typed).toBe('look');
  });

  it('refuses an upload this session does not hold — S-210', async () => {
    const { resolver, live } = setup();

    await expect(
      resolver.resolve(live, 'x', [{ kind: 'upload', attachmentId: 'att_nope' }]),
    ).rejects.toBeInstanceOf(AttachmentNotFoundError);
  });
});
