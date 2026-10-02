import { beforeEach, describe, expect, it } from 'vitest';

import {
  CancelQueuedPromptUseCase,
  InspectSessionUseCase,
  ModelCatalog,
} from '@application/session';
import type { SessionRegistry } from '@application/session';
import { UserId } from '@domain/auth';
import {
  ClaudeUnavailableError,
  QueuedPromptNotFoundError,
  QueuedPromptStartedError,
  SessionForbiddenError,
} from '@domain/session';
import type { InstallationModel, Session } from '@domain/session';
import {
  aRegistry,
  aSession,
  RecordingHandle,
  SESSION_ID,
} from '../../../support/builders/session.builder';

const owner = UserId.create('auth|owner');
const stranger = UserId.create('auth|stranger');
const SECOND = '01J0ABCDEFGHJKMNPQRSTVWXY1';

const sonnet: InstallationModel = {
  value: 'sonnet',
  resolvedModel: 'claude-sonnet-5',
  displayName: 'Sonnet',
  description: 'Sonnet 5',
  supportsEffort: true,
  supportedEffortLevels: ['low', 'high'],
};

describe('what the panel asks about a live session — plan 08, F4', () => {
  let registry: SessionRegistry;
  let handles: Map<string, RecordingHandle>;
  let session: Session;
  let inspect: InspectSessionUseCase;
  let catalog: ModelCatalog;

  beforeEach(() => {
    session = aSession();
    const built = aRegistry([session, aSession({ id: SECOND })]);
    registry = built.registry;
    handles = built.handles;
    catalog = new ModelCatalog();
    inspect = new InspectSessionUseCase(registry, catalog);
    for (const handle of handles.values()) {
      handle.cliVersion = '2.1.277';
      handle.offered = [sonnet];
    }
  });

  const handle = (id = SESSION_ID): RecordingHandle => handles.get(id) as RecordingHandle;

  it('answers the installation’s models, and the one the session runs — S-166', async () => {
    expect(await inspect.modelsOf(SESSION_ID, owner)).toEqual({
      current: 'claude-sonnet-5',
      models: [sonnet],
    });
  });

  it('asks once for two sessions of one installation and workspace, and again for a new version — S-167', async () => {
    let release = (): void => undefined;
    handle().modelsHeld = new Promise((resolve) => {
      release = resolve;
    });

    const both = Promise.all([
      inspect.modelsOf(SESSION_ID, owner),
      inspect.modelsOf(SECOND, owner),
    ]);
    release();
    await both;
    expect(handle().modelCalls + handle(SECOND).modelCalls).toBe(1);
    expect(catalog.latestFor('/srv/projects/app')).toEqual([sonnet]);

    handle(SECOND).cliVersion = '2.1.300';
    await inspect.modelsOf(SECOND, owner);
    expect(handle(SECOND).modelCalls).toBe(1);
  });

  it('fails as the CLI did, and keeps no failure — S-168', async () => {
    handle().insightFailWith = new ClaudeUnavailableError(SESSION_ID);

    await expect(inspect.modelsOf(SESSION_ID, owner)).rejects.toThrow(ClaudeUnavailableError);
    handle().insightFailWith = null;
    await expect(inspect.modelsOf(SESSION_ID, owner)).resolves.toBeDefined();
  });

  it('answers the use of the context, and the MCP servers — S-173, S-176', async () => {
    handle().servers = [{ name: 'docs', status: 'connected', toolCount: 3 }];

    expect((await inspect.contextOf(SESSION_ID, owner)).maxTokens).toBe(200_000);
    expect(await inspect.mcpServersOf(SESSION_ID, owner)).toEqual([
      { name: 'docs', status: 'connected', toolCount: 3 },
    ]);
  });

  it("refuses somebody else's session", async () => {
    await expect(inspect.contextOf(SESSION_ID, stranger)).rejects.toThrow(SessionForbiddenError);
  });

  describe('cancelling a queued prompt — B-34', () => {
    const cancel = (): CancelQueuedPromptUseCase => new CancelQueuedPromptUseCase(registry);
    const aPrompt = (queueId: string) => ({
      queueId,
      text: queueId,
      promptedBy: 'web',
      preview: queueId,
    });

    beforeEach(() => {
      session.prompts.submit(aPrompt('q1'));
      session.prompts.submit(aPrompt('q2'));
      session.prompts.submit(aPrompt('q3'));
    });

    it('takes it out, and says a second cancel changed nothing — S-157, S-159', () => {
      expect(cancel().execute(SESSION_ID, 'q2', owner)).toBe(true);
      expect(cancel().execute(SESSION_ID, 'q2', owner)).toBe(false);
    });

    it('refuses one that started, and one the queue never had — S-158, S-159', () => {
      session.prompts.turnEnded();

      expect(() => cancel().execute(SESSION_ID, 'q2', owner)).toThrow(QueuedPromptStartedError);
      expect(() => cancel().execute(SESSION_ID, 'q9', owner)).toThrow(QueuedPromptNotFoundError);
    });
  });
});
