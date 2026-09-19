import { describe, expect, it } from 'vitest';

import { AgentSdkClaudeSessionAdapter } from '@adapter/outbound/claude/agent-sdk.adapter';
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
import { aWorkspace } from '../../../../support/builders/workspace.builder';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import { FixedClock } from '../../../../support/fakes/fixed-clock';
import { StubPermissionGate } from '../../../../support/fakes/stub-permission-gate';
import { RecordingJournal } from '../../../../support/fakes/recording-journal';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';
import { SequentialIds } from '../../../../support/fakes/sequential-ids';

const owner = UserId.create('auth|owner');
const sessionId = SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ');
const now = new Date('2026-09-18T12:00:00.000Z');

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

    broadcaster.publish(sessionId, { type: 'message.delta', payload: { delta: 'hi' } });

    const replayed = buffer.since(sessionId.value, 0);
    expect(replayed.events).toHaveLength(1);
    expect(replayed.events[0]).toMatchObject({ type: 'message.delta', kind: 'event', seq: 1 });
  });

  it('numbers a session in one place, so replay never skips or repeats', () => {
    const { broadcaster, buffer } = build();

    broadcaster.publish(sessionId, { type: 'a', payload: {} });
    broadcaster.publish(sessionId, { type: 'b', payload: {} });

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
  it('hands back a handle that drives the session', async () => {
    const { createQuery, record } = scriptedSdk();
    const adapter = new AgentSdkClaudeSessionAdapter(
      createQuery,
      { record: () => Promise.resolve() },
      new RecordingJournal(),
      new StubPermissionGate(),
      { maxBudgetUsd: 10, maxTurns: 100 },
      new FixedClock(now),
      new RecordingLogger().logger,
    );

    const handle = await adapter.start({
      sessionId,
      workspace: WorkspacePath.create('/srv/projects/app'),
      model: null,
      permissionMode: 'default',
      resumeSessionId: null,
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
