import { describe, expect, it } from 'vitest';

import {
  ApproveProjectMcpServerUseCase,
  ListProjectMcpServersUseCase,
  McpEngineCapabilities,
  ProjectMcpServersSources,
  RejectProjectMcpServerUseCase,
} from '@application/mcp';
import type { McpProjectApprovalDependencies } from '@application/mcp';
import type { FolderAccess } from '@application/agent-settings';
import { RecordAuditEventUseCase } from '@application/audit';
import { McpApprovalStaleError, McpEngineNotSupportedError } from '@domain/mcp';
import { UserId } from '@domain/auth';
import { WorkspaceForbiddenError, WorkspaceNotAllowedError } from '@domain/workspace';
import { WorkspacePath } from '@domain/workspace';
import { FakeProjectMcpServersSource } from '../../../support/fakes/fake-project-mcp-servers-source';
import { FixedClock } from '../../../support/fakes/fixed-clock';
import { InMemoryMcpProjectApprovalRepository } from '../../../support/fakes/in-memory-mcp-project-approval.repository';
import { RecordingAuditEvents } from '../../../support/fakes/recording-audit-events';
import { SequentialIds } from '../../../support/fakes/sequential-ids';

const ENGINE = 'claude';
const USER = UserId.create('auth|project-mcp');
const STRANGER = UserId.create('auth|project-mcp-stranger');
const ROOT = '/srv/projects';
const FOLDER = '/srv/projects/repo';
const NOW = new Date('2026-10-19T12:00:00Z');

function harness() {
  const source = new FakeProjectMcpServersSource();
  const approvals = new InMemoryMcpProjectApprovalRepository();
  const events = new RecordingAuditEvents();
  const clock = new FixedClock(NOW);

  const folders: FolderAccess = {
    resolve: (raw, userId) =>
      raw.startsWith(ROOT) && userId.value === USER.value
        ? Promise.resolve(WorkspacePath.create(raw))
        : raw.startsWith(ROOT)
          ? Promise.reject(new WorkspaceForbiddenError(raw))
          : Promise.reject(new WorkspaceNotAllowedError(raw)),
    locate: async (raw, userId) => ({
      folder: await folders.resolve(raw, userId),
      root: ROOT,
    }),
    firstRoot: () => Promise.resolve(WorkspacePath.create(ROOT)),
  };

  const deps: McpProjectApprovalDependencies = {
    capabilities: new McpEngineCapabilities([ENGINE]),
    folders,
    sources: new ProjectMcpServersSources([{ engine: ENGINE, source }]),
    approvals,
    trail: new RecordAuditEventUseCase(events, new SequentialIds()),
    clock,
  };

  return {
    source,
    approvals,
    events,
    list: new ListProjectMcpServersUseCase(deps),
    approve: new ApproveProjectMcpServerUseCase(deps),
    reject: new RejectProjectMcpServerUseCase(deps),
  };
}

const STDIO_ENTRY = {
  name: 'docs',
  transport: 'stdio' as const,
  command: 'npx',
  args: ['-y', 'server'],
  url: null,
  env: [{ name: 'TOKEN', value: '${TOKEN}' }],
  headers: [],
};

describe('ListProjectMcpServersUseCase — plan 13, B-24, S-100', () => {
  it('shows pending for an entry never decided on', async () => {
    const { list, source } = harness();
    source.set(FOLDER, { entries: [STDIO_ENTRY], error: null });

    const result = await list.execute(USER, ENGINE, FOLDER);

    expect(result.errors).toEqual([]);
    expect(result.servers).toHaveLength(1);
    expect(result.servers[0]).toMatchObject({ folderPath: FOLDER, name: 'docs', state: 'pending' });
  });

  it('shows approved when our decision matches the current digest, changed when it does not', async () => {
    const { list, source, approvals } = harness();
    source.set(FOLDER, { entries: [STDIO_ENTRY], error: null });
    await approvals.upsert(
      {
        userId: USER,
        engine: ENGINE,
        folderPath: FOLDER,
        name: 'docs',
        digest: 'stale-digest',
        decision: 'approved',
        snapshot: null,
      },
      NOW,
    );

    const changed = await list.execute(USER, ENGINE, FOLDER);
    expect(changed.servers[0]?.state).toBe('changed');

    const realDigest = changed.servers[0]?.digest as string;
    await approvals.upsert(
      {
        userId: USER,
        engine: ENGINE,
        folderPath: FOLDER,
        name: 'docs',
        digest: realDigest,
        decision: 'approved',
        snapshot: null,
      },
      NOW,
    );
    const approved = await list.execute(USER, ENGINE, FOLDER);
    expect(approved.servers[0]?.state).toBe('approved');
  });

  it('shows rejected regardless of a later change to the entry', async () => {
    const { list, source, approvals } = harness();
    source.set(FOLDER, { entries: [STDIO_ENTRY], error: null });
    await approvals.upsert(
      {
        userId: USER,
        engine: ENGINE,
        folderPath: FOLDER,
        name: 'docs',
        digest: 'whatever',
        decision: 'rejected',
        snapshot: null,
      },
      NOW,
    );

    const result = await list.execute(USER, ENGINE, FOLDER);
    expect(result.servers[0]?.state).toBe('rejected');
  });

  it('reports a file it could not read as an error, approvable nothing — S-106', async () => {
    const { list, source } = harness();
    source.set(FOLDER, { entries: [], error: 'malformed' });

    const result = await list.execute(USER, ENGINE, FOLDER);
    expect(result.servers).toEqual([]);
    expect(result.errors).toEqual([{ folderPath: FOLDER, reason: 'malformed' }]);
  });

  it('refuses a folder outside the allowlist, or of somebody else — S-110', async () => {
    const { list } = harness();

    await expect(list.execute(USER, ENGINE, '/elsewhere')).rejects.toBeInstanceOf(
      WorkspaceNotAllowedError,
    );
    await expect(list.execute(STRANGER, ENGINE, FOLDER)).rejects.toBeInstanceOf(
      WorkspaceForbiddenError,
    );
  });

  it('refuses an engine without the mcp capability', async () => {
    const { list } = harness();
    await expect(list.execute(USER, 'codex', FOLDER)).rejects.toBeInstanceOf(
      McpEngineNotSupportedError,
    );
  });
});

describe('ApproveProjectMcpServerUseCase — plan 13, B-24', () => {
  it('approves at the digest shown, and records it in the trail with the command por extenso — S-101, S-108', async () => {
    const { list, approve, events, approvals } = harnessWith(STDIO_ENTRY);
    const shown = (await list.execute(USER, ENGINE, FOLDER)).servers[0] as { digest: string };

    const approved = await approve.execute(USER, ENGINE, FOLDER, 'docs', shown.digest);

    expect(approved.state).toBe('approved');
    expect((await approvals.findOne(USER, ENGINE, FOLDER, 'docs'))?.decision).toBe('approved');
    expect(events.kinds).toEqual(['mcp.projectServerApproved']);
    expect(events.appended[0]?.details).toMatchObject({
      messageKey: 'mcp.description.stdioFolder',
    });
  });

  it('refuses a digest that no longer matches — the file changed in between — S-102', async () => {
    const { list, approve, source } = harnessWith(STDIO_ENTRY);
    const shown = (await list.execute(USER, ENGINE, FOLDER)).servers[0] as { digest: string };
    source.set(FOLDER, { entries: [{ ...STDIO_ENTRY, command: 'node' }], error: null });

    await expect(
      approve.execute(USER, ENGINE, FOLDER, 'docs', shown.digest),
    ).rejects.toBeInstanceOf(McpApprovalStaleError);
  });

  it('refuses when the entry is simply gone', async () => {
    const { approve } = harnessWith(STDIO_ENTRY);
    await expect(approve.execute(USER, ENGINE, FOLDER, 'ghost', 'anything')).rejects.toBeInstanceOf(
      McpApprovalStaleError,
    );
  });

  it('approving the same digest twice writes nothing a second time — S-107', async () => {
    const { list, approve, events } = harnessWith(STDIO_ENTRY);
    const shown = (await list.execute(USER, ENGINE, FOLDER)).servers[0] as { digest: string };

    await approve.execute(USER, ENGINE, FOLDER, 'docs', shown.digest);
    await approve.execute(USER, ENGINE, FOLDER, 'docs', shown.digest);

    expect(events.kinds).toEqual(['mcp.projectServerApproved']);
  });

  it('re-approving after a rejection replaces the decision, with a fresh trail entry', async () => {
    const { list, approve, reject, approvals, events } = harnessWith(STDIO_ENTRY);
    const shown = (await list.execute(USER, ENGINE, FOLDER)).servers[0] as { digest: string };
    await reject.execute(USER, ENGINE, FOLDER, 'docs');

    await approve.execute(USER, ENGINE, FOLDER, 'docs', shown.digest);

    expect((await approvals.findOne(USER, ENGINE, FOLDER, 'docs'))?.decision).toBe('approved');
    expect(events.kinds).toEqual(['mcp.projectServerRejected', 'mcp.projectServerApproved']);
  });

  it('refuses a folder of somebody else, and an engine without the capability — S-109, S-110', async () => {
    const { approve } = harnessWith(STDIO_ENTRY);
    await expect(approve.execute(STRANGER, ENGINE, FOLDER, 'docs', 'x')).rejects.toBeInstanceOf(
      WorkspaceForbiddenError,
    );
    await expect(approve.execute(USER, 'codex', FOLDER, 'docs', 'x')).rejects.toBeInstanceOf(
      McpEngineNotSupportedError,
    );
  });

  describe('keeping what was approved — plan 13, B-28, D-80, S-136', () => {
    it('keeps the entry it approved, without its name', async () => {
      const { list, approve } = harnessWith(STDIO_ENTRY);
      const shown = (await list.execute(USER, ENGINE, FOLDER)).servers[0] as { digest: string };

      const approved = await approve.execute(USER, ENGINE, FOLDER, 'docs', shown.digest);

      expect(approved.approvedSnapshot).toEqual({
        transport: 'stdio',
        command: 'npx',
        args: ['-y', 'server'],
        url: null,
        env: [{ name: 'TOKEN', value: '${TOKEN}' }],
        headers: [],
      });
    });

    it('a changed entry still carries what was actually approved, not the new content', async () => {
      const { list, approve, source } = harnessWith(STDIO_ENTRY);
      const shown = (await list.execute(USER, ENGINE, FOLDER)).servers[0] as { digest: string };
      await approve.execute(USER, ENGINE, FOLDER, 'docs', shown.digest);

      source.set(FOLDER, { entries: [{ ...STDIO_ENTRY, command: 'node' }], error: null });
      const changed = (await list.execute(USER, ENGINE, FOLDER)).servers[0];

      expect(changed?.state).toBe('changed');
      expect(changed?.command).toBe('node');
      expect(changed?.approvedSnapshot?.command).toBe('npx');
    });

    it('approving the same digest twice still answers the kept snapshot — S-107', async () => {
      const { list, approve } = harnessWith(STDIO_ENTRY);
      const shown = (await list.execute(USER, ENGINE, FOLDER)).servers[0] as { digest: string };

      await approve.execute(USER, ENGINE, FOLDER, 'docs', shown.digest);
      const second = await approve.execute(USER, ENGINE, FOLDER, 'docs', shown.digest);

      expect(second.approvedSnapshot?.command).toBe('npx');
    });

    it('a rejection keeps no snapshot, and a pending entry has none either', async () => {
      const { list, reject } = harnessWith(STDIO_ENTRY);

      expect((await list.execute(USER, ENGINE, FOLDER)).servers[0]?.approvedSnapshot).toBeNull();

      await reject.execute(USER, ENGINE, FOLDER, 'docs');
      expect((await list.execute(USER, ENGINE, FOLDER)).servers[0]?.approvedSnapshot).toBeNull();
    });
  });
});

describe('RejectProjectMcpServerUseCase — plan 13, B-24', () => {
  it('rejects an entry, recording it in the trail por extenso — S-108', async () => {
    const { reject, approvals, events } = harnessWith(STDIO_ENTRY);

    await reject.execute(USER, ENGINE, FOLDER, 'docs');

    expect((await approvals.findOne(USER, ENGINE, FOLDER, 'docs'))?.decision).toBe('rejected');
    expect(events.kinds).toEqual(['mcp.projectServerRejected']);
    expect(events.appended[0]?.details).toMatchObject({
      messageKey: 'mcp.description.stdioFolder',
    });
  });

  it('rejects a name that is not even in the file — a pre-emptive no', async () => {
    const { reject, approvals, events } = harnessWith(STDIO_ENTRY);

    await reject.execute(USER, ENGINE, FOLDER, 'ghost');

    expect((await approvals.findOne(USER, ENGINE, FOLDER, 'ghost'))?.decision).toBe('rejected');
    expect(events.appended[0]?.details).toEqual({ engine: ENGINE, folder: FOLDER });
  });

  it('rejecting twice writes nothing a second time — S-107, the same shape as approving', async () => {
    const { reject, events } = harnessWith(STDIO_ENTRY);

    await reject.execute(USER, ENGINE, FOLDER, 'docs');
    await reject.execute(USER, ENGINE, FOLDER, 'docs');

    expect(events.kinds).toEqual(['mcp.projectServerRejected']);
  });

  it('never needs a digest, and never throws stale even when the file changed since', async () => {
    const { reject, source } = harnessWith(STDIO_ENTRY);
    source.set(FOLDER, { entries: [{ ...STDIO_ENTRY, command: 'node' }], error: null });

    await expect(reject.execute(USER, ENGINE, FOLDER, 'docs')).resolves.toBeUndefined();
  });

  it('refuses a folder outside the allowlist — S-110', async () => {
    const { reject } = harnessWith(STDIO_ENTRY);
    await expect(reject.execute(USER, ENGINE, '/elsewhere', 'docs')).rejects.toBeInstanceOf(
      WorkspaceNotAllowedError,
    );
  });
});

function harnessWith(entry: typeof STDIO_ENTRY) {
  const built = harness();
  built.source.set(FOLDER, { entries: [entry], error: null });
  return built;
}
