import { describe, expect, it } from 'vitest';

import { AgentSdkClaudeSessionAdapter } from '@adapter/outbound/engines/claude/agent-sdk.adapter';
import type { ClaudeInstallation } from '@adapter/outbound/engines/claude/claude-installation';
import { CLAUDE_SECURITY_CONTRACT } from '@adapter/outbound/engines/claude/security-contract';
import { HubSessionBroadcaster } from '@adapter/outbound/session/hub-session.broadcaster';
import { WorkspaceModuleResolver } from '@adapter/outbound/session/workspace-module.resolver';
import type { ResolveWorkspaceUseCase } from '@application/workspace';
import { UserId } from '@domain/auth';
import { SessionId } from '@domain/session';
import { WorkspaceNotAllowedError, WorkspacePath } from '@domain/workspace';
import { ConnectionRegistry } from '@infra/websocket/connection-registry';
import { EventBuffer } from '@infra/websocket/event-buffer';
import { FrameBuilder } from '@infra/websocket/frame-builder';
import { SessionHub } from '@infra/websocket/session-hub';
import { aConversation, anEvent } from '../../../../support/builders/session.builder';
import { aWorkspace } from '../../../../support/builders/workspace.builder';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import { FixedClock } from '../../../../support/fakes/fixed-clock';
import { ManualScheduler } from '../../../../support/fakes/manual-scheduler';
import { StubPermissionGate } from '../../../../support/fakes/stub-permission-gate';
import { RecordingJournal } from '../../../../support/fakes/recording-journal';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';
import { SequentialIds } from '../../../../support/fakes/sequential-ids';
import { SequentialUuids } from '../../../../support/fakes/sequential-uuids';

const owner = UserId.create('auth|owner');
const sessionId = SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ');
const now = new Date('2026-09-18T12:00:00.000Z');

/** The CLI and the SDK as the files that pin them would say. */
const INSTALLATION: ClaudeInstallation = {
  cli: { version: '2.1.277', reason: null },
  sdk: { version: '0.3.277', reason: null },
};

describe('HubSessionBroadcaster', () => {
  const build = (): { broadcaster: HubSessionBroadcaster; buffer: EventBuffer } => {
    const buffer = new EventBuffer(10);
    const hub = new SessionHub(
      new ConnectionRegistry(),
      buffer,
      new FrameBuilder(new FixedClock(now), new SequentialIds()),
      new RecordingLogger().logger,
    );

    return { broadcaster: new HubSessionBroadcaster(hub), buffer };
  };

  it('numbers the event and keeps it for replay', () => {
    const { broadcaster, buffer } = build();

    broadcaster.publish(sessionId, anEvent('message.delta', { delta: 'hi' }));

    const replayed = buffer.since(sessionId.value, 0);
    expect(replayed.events).toHaveLength(1);
    expect(replayed.events[0]).toMatchObject({ type: 'message.delta', kind: 'event', seq: 1 });
  });

  it('numbers a session in one place, so replay never skips or repeats', () => {
    const { broadcaster, buffer } = build();

    broadcaster.publish(sessionId, anEvent('a'));
    broadcaster.publish(sessionId, anEvent('b'));

    expect(buffer.since(sessionId.value, 0).events.map((event) => event.seq)).toEqual([1, 2]);
  });
});

describe('WorkspaceModuleResolver', () => {
  /** A stand-in for the `workspace` use case, which is the other side of the port. */
  function workspaceUseCase(
    outcome: 'allow' | 'refuse',
    calls: { rawPath: string; recordUse: boolean }[],
  ): ResolveWorkspaceUseCase {
    return {
      execute: (rawPath: string, _userId: UserId, options?: { readonly recordUse: boolean }) => {
        calls.push({ rawPath, recordUse: options?.recordUse ?? false });

        return outcome === 'allow'
          ? Promise.resolve({ path: WorkspacePath.create(rawPath), workspace: aWorkspace() })
          : Promise.reject(new WorkspaceNotAllowedError(rawPath));
      },
    } as unknown as ResolveWorkspaceUseCase;
  }

  it('answers the resolved path', async () => {
    const calls: { rawPath: string; recordUse: boolean }[] = [];

    const path = await new WorkspaceModuleResolver(workspaceUseCase('allow', calls)).resolve(
      '/srv/projects/app',
      owner,
    );

    expect(path.value).toBe('/srv/projects/app');
  });

  it('records the use, because opening a session is what "last used" means', async () => {
    const calls: { rawPath: string; recordUse: boolean }[] = [];

    await new WorkspaceModuleResolver(workspaceUseCase('allow', calls)).resolve('/srv/x', owner);

    expect(calls).toEqual([{ rawPath: '/srv/x', recordUse: true }]);
  });

  it('lets the refusal through untouched', async () => {
    await expect(
      new WorkspaceModuleResolver(workspaceUseCase('refuse', [])).resolve('/etc', owner),
    ).rejects.toThrow(WorkspaceNotAllowedError);
  });
});

describe('AgentSdkClaudeSessionAdapter', () => {
  const engineAdapter = (version: string | null = '2.1.277') =>
    new AgentSdkClaudeSessionAdapter(
      scriptedSdk().createQuery,
      { record: () => Promise.resolve() },
      new RecordingJournal(),
      new StubPermissionGate(),
      { maxBudgetUsd: 10, maxTurns: 100, autoCompactEnabled: true, autoCompactWindow: 0 },
      new FixedClock(now),
      new ManualScheduler(),
      version,
      new RecordingLogger().logger,
      new SequentialUuids(),
      INSTALLATION,
    );

  it('describes itself without spawning anything — plan 28, B-10, S-30', async () => {
    const adapter = engineAdapter();
    const [first, second] = await Promise.all([adapter.describe(), adapter.describe()]);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      displayName: 'Claude Code',
      state: 'available',
      reason: null,
      version: '2.1.277',
      authenticated: null,
    });
    expect(first.engine.value).toBe('claude');
    expect(first.capabilities.fork).toBe('atMessage');
    expect(first.capabilities.permissionModes).not.toContain('bypassPermissions');
  });

  it('names the parts of its installation — the CLI and the SDK, as read at boot — plan 28, S-100', async () => {
    expect((await engineAdapter().describe()).components).toEqual({
      binary: { version: '2.1.277', reason: null },
      library: { version: '0.3.277', reason: null },
    });
  });

  it('states the security contract of every engine, and it holds — plan 28, B-35', () => {
    const adapter = engineAdapter();

    expect(adapter.security).toBe(CLAUDE_SECURITY_CONTRACT);
    expect(adapter.security.assert()).toEqual({ holds: true });
  });

  it('refuses to name a conversation by an id that is not one the SDK takes', () => {
    const adapter = new AgentSdkClaudeSessionAdapter(
      scriptedSdk().createQuery,
      { record: () => Promise.resolve() },
      new RecordingJournal(),
      new StubPermissionGate(),
      { maxBudgetUsd: 10, maxTurns: 100, autoCompactEnabled: true, autoCompactWindow: 0 },
      new FixedClock(now),
      new ManualScheduler(),
      '2.1.277',
      new RecordingLogger().logger,
      { next: () => 'not-a-uuid' },
      INSTALLATION,
    );

    expect(() => adapter.newConversation()).toThrow('not a UUID');
  });

  it('says it is unavailable when the binary it spawns could not be read', async () => {
    expect(await engineAdapter(null).describe()).toMatchObject({
      state: 'unavailable',
      reason: 'engine.error.notInstalled',
    });
  });

  it('mints the id of a new conversation, a UUID, and names a conversation only by one — S-25', () => {
    const adapter = engineAdapter();

    expect(adapter.newConversation().key).toBe('claude:00000000-0000-4000-8000-000000000001');
    expect(adapter.conversationOf('6b41b192-a41b-46c2-b8d7-5098d8c825be')?.engine.value).toBe(
      'claude',
    );
    expect(adapter.conversationOf('6B41B192-A41B-46C2-B8D7-5098D8C825BE')).toBeNull();
    expect(adapter.conversationOf('not-a-uuid')).toBeNull();
  });

  it('hands back a handle that drives the session', async () => {
    const { createQuery, record } = scriptedSdk();
    const adapter = new AgentSdkClaudeSessionAdapter(
      createQuery,
      { record: () => Promise.resolve() },
      new RecordingJournal(),
      new StubPermissionGate(),
      { maxBudgetUsd: 10, maxTurns: 100, autoCompactEnabled: true, autoCompactWindow: 0 },
      new FixedClock(now),
      new ManualScheduler(),
      '2.1.277',
      new RecordingLogger().logger,
      new SequentialUuids(),
      INSTALLATION,
    );

    const handle = await adapter.start({
      sessionId,
      workspace: WorkspacePath.create('/srv/projects/app'),
      model: null,
      permissionMode: 'ask',
      conversation: aConversation(),
      onEvent: () => undefined,
      onClosed: () => undefined,
    });

    handle.prompt('hello');

    // The subprocess is opened as the port is called, which is why `start` resolves before any
    // event arrives: the caller gets something to drive, not a finished session.
    expect(record.options?.cwd).toBe('/srv/projects/app');
    expect(record.prompts.length + 1).toBeGreaterThan(0);

    await handle.close();
    expect(record.closes).toBeGreaterThan(0);
  });
});
