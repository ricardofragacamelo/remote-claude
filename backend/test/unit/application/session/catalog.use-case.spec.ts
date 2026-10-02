import { describe, expect, it } from 'vitest';

import {
  CommandCatalog,
  ModelCatalog,
  ReadCatalogUseCase,
  SessionRegistry,
} from '@application/session';
import type { ClaudeSessionPort, ClaudeSessionStart, FolderLocator } from '@application/session';
import { UserId } from '@domain/auth';
import { ClaudeUnavailableError, SessionLimitReachedError } from '@domain/session';
import { WorkspaceNotAllowedError, WorkspacePath } from '@domain/workspace';
import { SequentialIds } from '../../../support/fakes/sequential-ids';
import { SequentialUuids } from '../../../support/fakes/sequential-uuids';
import { aClock, aCommand, RecordingHandle } from '../../../support/builders/session.builder';

const owner = UserId.create('auth|owner');
const FOLDER = '/srv/projects/app';
const LIMITS = {
  attachmentMaxBytes: 5_242_880,
  attachmentImageTypes: ['image/png'],
  contextWarnFraction: 0.25,
  draftWindowTokens: 200_000,
  contextMaxBytes: 8_388_608,
};

/** The port, opening a recording handle each time — and saying how many it opened. */
class ProbePort implements ClaudeSessionPort {
  readonly started: ClaudeSessionStart[] = [];
  readonly handles: RecordingHandle[] = [];
  held: Promise<void> | null = null;
  failWith: Error | null = null;

  start(input: ClaudeSessionStart): Promise<RecordingHandle> {
    this.started.push(input);
    const handle = new RecordingHandle();
    handle.cliVersion = '2.1.277';
    handle.commands = [aCommand('init', { builtin: true }), aCommand('deploy')];
    handle.offered = [
      {
        value: 'default',
        resolvedModel: null,
        displayName: 'Default',
        description: '',
        supportsEffort: false,
        supportedEffortLevels: [],
      },
    ];
    handle.commandsHeld = this.held;
    handle.commandsFailWith = this.failWith;
    this.handles.push(handle);
    return Promise.resolve(handle);
  }
}

const locator: FolderLocator = {
  locate: (raw) =>
    raw.startsWith('/srv/')
      ? Promise.resolve(WorkspacePath.create(raw))
      : Promise.reject(new WorkspaceNotAllowedError(raw)),
};

function setup(limit = 10) {
  const registry = new SessionRegistry(limit, aClock());
  const port = new ProbePort();
  const commands = new CommandCatalog();
  const models = new ModelCatalog();
  const useCase = new ReadCatalogUseCase(
    locator,
    registry,
    { commands, models },
    {
      claude: port,
      sessionIds: new SequentialIds(),
      conversationIds: new SequentialUuids(),
      cliVersion: '2.1.277',
    },
    LIMITS,
  );
  return { registry, port, commands, models, useCase };
}

describe('ReadCatalogUseCase — plan 08, B-50, D-13', () => {
  it('opens a query that only asks, once, and closes it — S-244', async () => {
    const { useCase, port, registry } = setup();

    const catalog = await useCase.execute(FOLDER, owner);

    expect(catalog.commands.map((command) => [command.name, command.origin])).toEqual([
      ['init', 'builtin'],
      ['deploy', 'project'],
    ]);
    expect(catalog.models).toHaveLength(1);
    expect(catalog.limits).toEqual(LIMITS);
    expect(catalog.cliVersion).toBe('2.1.277');
    expect(port.started).toHaveLength(1);
    expect(port.started[0]?.workspace.value).toBe(FOLDER);
    expect(port.handles[0]?.closes).toBe(1);
    expect(port.handles[0]?.prompts).toEqual([]);
    expect(registry.size).toBe(0);
  });

  it('answers from the catalogue the next time, without a query — S-244', async () => {
    const { useCase, port } = setup();

    await useCase.execute(FOLDER, owner);
    await useCase.execute(FOLDER, owner);

    expect(port.started).toHaveLength(1);
  });

  it('makes one query for two drafts asking together — S-245', async () => {
    const { useCase, port } = setup();
    let release = (): void => undefined;
    port.held = new Promise<void>((resolve) => {
      release = resolve;
    });

    const both = Promise.all([useCase.execute(FOLDER, owner), useCase.execute(FOLDER, owner)]);
    await Promise.resolve();
    release();
    const [first, second] = await both;

    expect(port.started).toHaveLength(1);
    expect(second).toEqual(first);
  });

  it('takes a slot while it lives, and refuses when there is none', async () => {
    const { useCase, registry, port } = setup(1);
    registry.reserve();

    await expect(useCase.execute(FOLDER, owner)).rejects.toBeInstanceOf(SessionLimitReachedError);
    expect(port.started).toHaveLength(0);
  });

  it('gives the slot back and closes the query when the CLI fails — S-246', async () => {
    const { useCase, port, registry } = setup();
    port.failWith = new ClaudeUnavailableError('down');

    await expect(useCase.execute(FOLDER, owner)).rejects.toBeInstanceOf(ClaudeUnavailableError);
    expect(port.handles[0]?.closes).toBe(1);
    expect(registry.size).toBe(0);

    port.failWith = null;
    await expect(useCase.execute(FOLDER, owner)).resolves.toMatchObject({ cliVersion: '2.1.277' });
  });

  it('refuses a folder the allowlist refuses, before anything is spawned', async () => {
    const { useCase, port } = setup();

    await expect(useCase.execute('/etc', owner)).rejects.toBeInstanceOf(WorkspaceNotAllowedError);
    expect(port.started).toHaveLength(0);
  });
});

describe('ReadCatalogUseCase — the edges of the query', () => {
  /** A port whose query says things and ends, as a real one might while it lives. */
  class ChattyPort extends ProbePort {
    override start(input: ClaudeSessionStart): Promise<RecordingHandle> {
      input.onEvent({ type: 'session.statusChanged', payload: {} });
      input.onClosed('completed');
      return super.start(input).then((handle) => {
        handle.cliVersion = null;
        return handle;
      });
    }
  }

  it('ignores what the query says, and keeps the version read at boot when it says none', async () => {
    const registry = new SessionRegistry(10, aClock());
    const useCase = new ReadCatalogUseCase(
      locator,
      registry,
      { commands: new CommandCatalog(), models: new ModelCatalog() },
      {
        claude: new ChattyPort(),
        sessionIds: new SequentialIds(),
        conversationIds: new SequentialUuids(),
        cliVersion: '2.1.277',
      },
      LIMITS,
    );

    expect((await useCase.execute(FOLDER, owner)).cliVersion).toBe('2.1.277');
  });

  it('gives the slot back when the query cannot even be opened', async () => {
    const registry = new SessionRegistry(10, aClock());
    const failing: ClaudeSessionPort = { start: () => Promise.reject(new Error('no binary')) };
    const useCase = new ReadCatalogUseCase(
      locator,
      registry,
      { commands: new CommandCatalog(), models: new ModelCatalog() },
      {
        claude: failing,
        sessionIds: new SequentialIds(),
        conversationIds: new SequentialUuids(),
        cliVersion: null,
      },
      LIMITS,
    );

    await expect(useCase.execute(FOLDER, owner)).rejects.toThrow('no binary');
    expect(registry.size).toBe(0);
  });
});
