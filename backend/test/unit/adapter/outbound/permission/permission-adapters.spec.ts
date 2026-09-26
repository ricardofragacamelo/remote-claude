import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it } from 'vitest';

import { PermissionBridge } from '@adapter/outbound/claude/permission-bridge';
import {
  EmitterPermissionEvents,
  PERMISSION_RESOLVED,
} from '@adapter/outbound/permission/emitter-permission.events';
import { HubPermissionBroadcaster } from '@adapter/outbound/permission/hub-permission.broadcaster';
import {
  RecordDecisionOnResolved,
  ReleaseAgentLoopOnResolved,
} from '@adapter/outbound/permission/permission-resolved.listeners';
import { RecordToolInvocationUseCase } from '@application/audit';
import type { PermissionResolvedEvent } from '@application/permission';
import { PermissionRequest } from '@domain/permission';
import type { AuditEntry } from '@domain/audit';
import { ConnectionRegistry } from '@infra/websocket/connection-registry';
import { EventBuffer } from '@infra/websocket/event-buffer';
import { FrameBuilder } from '@infra/websocket/frame-builder';
import { SessionHub } from '@infra/websocket/session-hub';
import {
  PERMISSION_NOW,
  PERMISSION_OWNER,
  PERMISSION_SESSION,
} from '../../../../support/builders/permission.builder';
import { FixedClock } from '../../../../support/fakes/fixed-clock';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';
import { SequentialIds } from '../../../../support/fakes/sequential-ids';

/** A settled request, ready to be published on the bus. */
function aResolvedEvent(decision: 'allow' | 'deny' = 'allow'): PermissionResolvedEvent {
  const request = PermissionRequest.open({
    id: 'request-1',
    sessionId: PERMISSION_SESSION,
    userId: PERMISSION_OWNER,
    projectPath: null,
    toolUseId: 'toolu-1',
    toolName: 'Bash',
    input: { command: 'rm -rf build/' },
    riskHint: 'destructive',
    requestedAt: PERMISSION_NOW,
    expiresAt: PERMISSION_NOW,
  });

  request.resolve({
    decision,
    reason: decision === 'deny' ? 'not now' : null,
    scope: 'once',
    resolvedBy: PERMISSION_OWNER,
    resolvedFrom: 'web',
    auto: false,
    at: PERMISSION_NOW,
  });

  return { request };
}

describe('HubPermissionBroadcaster', () => {
  let hub: SessionHub;
  let registry: ConnectionRegistry;
  let buffer: EventBuffer;
  let sent: string[];

  beforeEach(() => {
    registry = new ConnectionRegistry();
    buffer = new EventBuffer(10);
    hub = new SessionHub(
      registry,
      buffer,
      new FrameBuilder(new FixedClock(PERMISSION_NOW), new SequentialIds()),
      new RecordingLogger().logger,
    );

    sent = [];
    const connection = registry.register('c1', {
      send: (data) => sent.push(data),
      close: () => undefined,
    });
    connection.attached.add(PERMISSION_SESSION.value);
  });

  it('puts a question on the wire as a `request`, unnumbered', () => {
    new HubPermissionBroadcaster(hub).request(PERMISSION_SESSION, {
      type: 'permission.requested',
      payload: { requestId: 'request-1' },
    });

    const frame = JSON.parse(sent[0] ?? '{}') as Record<string, unknown>;
    expect(frame).toMatchObject({ kind: 'request', type: 'permission.requested' });
    expect(frame['seq']).toBeUndefined();
  });

  it('never keeps a question for replay', () => {
    // Replaying an answered question would put a dead card back on somebody's screen. What a
    // reconnecting client is owed comes from the registry, which knows what is still open.
    new HubPermissionBroadcaster(hub).request(PERMISSION_SESSION, {
      type: 'permission.requested',
      payload: { requestId: 'request-1' },
    });

    expect(buffer.since(PERMISSION_SESSION.value, 0).events).toEqual([]);
  });

  it('publishes a fact as an ordinary event, numbered and replayable', () => {
    new HubPermissionBroadcaster(hub).publish(PERMISSION_SESSION, {
      type: 'permission.resolved',
      payload: { requestId: 'request-1' },
    });

    expect(JSON.parse(sent[0] ?? '{}')).toMatchObject({ kind: 'event', seq: 1 });
    expect(buffer.since(PERMISSION_SESSION.value, 0).events).toHaveLength(1);
  });
});

describe('EmitterPermissionEvents', () => {
  it('publishes the resolution on the internal bus', () => {
    const emitter = new EventEmitter2();
    const seen: PermissionResolvedEvent[] = [];
    emitter.on(PERMISSION_RESOLVED, (event: PermissionResolvedEvent) => seen.push(event));

    new EmitterPermissionEvents(emitter, new RecordingLogger().logger).resolved(aResolvedEvent());

    expect(seen).toHaveLength(1);
  });

  it('never lets a failing consumer hold the agent loop', () => {
    // The most important consumer is the one that releases the loop. A listener that threw must
    // not be able to keep a session standing still.
    const emitter = new EventEmitter2();
    const log = new RecordingLogger();
    emitter.on(PERMISSION_RESOLVED, () => {
      throw new Error('a consumer blew up');
    });

    expect(() => {
      new EmitterPermissionEvents(emitter, log.logger).resolved(aResolvedEvent());
    }).not.toThrow();
    expect(log.lines.map((line) => line['msg'])).toContain(
      'a consumer of permission.resolved failed',
    );
  });
});

describe('the consumers of permission.resolved', () => {
  it('releases the agent loop', () => {
    const released: string[] = [];
    const bridge = {
      onResolved: (event: PermissionResolvedEvent) => released.push(event.request.id),
    } as unknown as PermissionBridge;

    new ReleaseAgentLoopOnResolved(bridge).handle(aResolvedEvent());

    expect(released).toEqual(['request-1']);
  });

  it('writes the decision to the trail, with who decided it — S-65', async () => {
    const written: AuditEntry[] = [];
    const record = new RecordToolInvocationUseCase(
      { append: (entry) => (written.push(entry), Promise.resolve()) },
      new SequentialIds(),
    );

    new RecordDecisionOnResolved(record, new RecordingLogger().logger).handle(
      aResolvedEvent('deny'),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      toolName: 'Bash',
      decision: 'denied',
      userId: PERMISSION_OWNER,
    });
  });

  it('attributes an automatic refusal to the owner of the session, not to nobody', async () => {
    const written: AuditEntry[] = [];
    const record = new RecordToolInvocationUseCase(
      { append: (entry) => (written.push(entry), Promise.resolve()) },
      new SequentialIds(),
    );
    const request = PermissionRequest.open({
      id: 'request-2',
      sessionId: PERMISSION_SESSION,
      userId: PERMISSION_OWNER,
      projectPath: null,
      toolUseId: null,
      toolName: 'Write',
      input: { file_path: '/srv/app/main.ts' },
      riskHint: 'write',
      requestedAt: PERMISSION_NOW,
      expiresAt: PERMISSION_NOW,
    });
    request.resolve(PermissionRequest.expiry(PERMISSION_NOW));

    new RecordDecisionOnResolved(record, new RecordingLogger().logger).handle({ request });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(written[0]).toMatchObject({ decision: 'denied', userId: PERMISSION_OWNER });
    // …and the verdict says nobody answered: the owner is who it was about, not who decided.
    expect(written[0]?.verdict).toEqual({
      requestId: 'request-2',
      auto: true,
      ruleId: null,
      scope: 'once',
      resolvedBy: null,
      resolvedFrom: null,
    });
  });

  it('writes what was decided with the entry: the request, who, and from where — S-81', async () => {
    const written: AuditEntry[] = [];
    const record = new RecordToolInvocationUseCase(
      { append: (entry) => (written.push(entry), Promise.resolve()) },
      new SequentialIds(),
    );

    new RecordDecisionOnResolved(record, new RecordingLogger().logger).handle(aResolvedEvent());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(written[0]?.verdict).toEqual({
      requestId: 'request-1',
      auto: false,
      ruleId: null,
      scope: 'once',
      resolvedBy: PERMISSION_OWNER,
      resolvedFrom: 'web',
    });
  });

  it('writes the rule that answered, when a rule did — S-30, S-81', async () => {
    const written: AuditEntry[] = [];
    const record = new RecordToolInvocationUseCase(
      { append: (entry) => (written.push(entry), Promise.resolve()) },
      new SequentialIds(),
    );
    const request = PermissionRequest.open({
      id: 'request-4',
      sessionId: PERMISSION_SESSION,
      userId: PERMISSION_OWNER,
      projectPath: '/srv/app',
      toolUseId: 'toolu-4',
      toolName: 'Bash',
      input: { command: 'git status' },
      riskHint: 'read',
      requestedAt: PERMISSION_NOW,
      expiresAt: PERMISSION_NOW,
    });
    request.resolve({
      decision: 'allow',
      reason: null,
      scope: 'project',
      resolvedBy: PERMISSION_OWNER,
      resolvedFrom: null,
      auto: true,
      ruleId: 'rule-9',
      at: PERMISSION_NOW,
    });

    new RecordDecisionOnResolved(record, new RecordingLogger().logger).handle({ request });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(written[0]).toMatchObject({ decision: 'allowed' });
    expect(written[0]?.verdict).toMatchObject({ auto: true, ruleId: 'rule-9', scope: 'project' });
  });

  it('says nothing about a request that is somehow not settled', () => {
    const record = new RecordToolInvocationUseCase(
      { append: () => Promise.reject(new Error('should not be called')) },
      new SequentialIds(),
    );
    const request = PermissionRequest.open({
      id: 'request-3',
      sessionId: PERMISSION_SESSION,
      userId: PERMISSION_OWNER,
      projectPath: null,
      toolUseId: null,
      toolName: 'Read',
      input: {},
      riskHint: 'read',
      requestedAt: PERMISSION_NOW,
      expiresAt: PERMISSION_NOW,
    });

    expect(() => {
      new RecordDecisionOnResolved(record, new RecordingLogger().logger).handle({ request });
    }).not.toThrow();
  });

  it('is loud when the trail refuses the decision', async () => {
    const log = new RecordingLogger();
    const record = new RecordToolInvocationUseCase(
      { append: () => Promise.reject(new Error('the database is gone')) },
      new SequentialIds(),
    );

    new RecordDecisionOnResolved(record, log.logger).handle(aResolvedEvent());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(log.lines.map((line) => line['msg'])).toContain(
      'the permission decision could not be written to the trail',
    );
  });
});
