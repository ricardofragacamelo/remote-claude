import { describe, expect, it } from 'vitest';

import { SessionRegistryLiveMcpStatus } from '@adapter/outbound/mcp/session-registry.live-mcp-status';
import { SessionRegistry } from '@application/session';
import { UserId } from '@domain/auth';
import { ConversationRef } from '@domain/engine';
import {
  aClock,
  aRegistry,
  aSession,
  RecordingHandle,
} from '../../../../support/builders/session.builder';

const OWNER = UserId.create('auth|owner');
const STRANGER = UserId.create('auth|stranger');
const ENGINE = 'claude';

describe('reading the live status of MCP servers across every session — plan 13, B-28, D-45', () => {
  it('reports what the only live session of the owner shows, by name', async () => {
    const mine = aSession({ id: '01J0AAAAAAAAAAAAAAAAAAAAAA', ownerId: OWNER.value });
    const { registry, handles } = aRegistry([mine]);
    const handle = handles.get(mine.id.value) as RecordingHandle;
    handle.servers = [{ name: 'github', status: 'connected', source: 'ours', toolCount: 3 }];

    const status = await new SessionRegistryLiveMcpStatus(registry).statusFor(OWNER, ENGINE);

    expect(status.get('github')).toBe('connected');
  });

  it('reports nothing for a name no live session shows', async () => {
    const { registry } = aRegistry([]);
    const status = await new SessionRegistryLiveMcpStatus(registry).statusFor(OWNER, ENGINE);
    expect(status.size).toBe(0);
  });

  it('never reads a session of somebody else', async () => {
    const theirs = aSession({ id: '01J0BBBBBBBBBBBBBBBBBBBBBB', ownerId: STRANGER.value });
    const { registry, handles } = aRegistry([theirs]);
    const handle = handles.get(theirs.id.value) as RecordingHandle;
    handle.servers = [{ name: 'github', status: 'connected', source: 'ours', toolCount: 3 }];

    const status = await new SessionRegistryLiveMcpStatus(registry).statusFor(OWNER, ENGINE);

    expect(status.size).toBe(0);
  });

  it('never reads a session on another engine', async () => {
    const registry = new SessionRegistry(10, aClock());
    const otherEngine = aSession({ id: '01J0CCCCCCCCCCCCCCCCCCCCCC', ownerId: OWNER.value });
    const handle = new RecordingHandle();
    handle.servers = [{ name: 'github', status: 'connected', source: 'ours', toolCount: 1 }];
    registry.add({
      session: otherEngine,
      handle,
      conversation: {
        ref: ConversationRef.create('codex', '6b41b192-a41b-46c2-b8d7-5098d8c825be'),
        resumedFrom: null,
      },
    });

    const status = await new SessionRegistryLiveMcpStatus(registry).statusFor(OWNER, ENGINE);

    expect(status.size).toBe(0);
  });

  it('never reads a session without the mcp capability', async () => {
    const noCapability = aSession({ id: '01J0DDDDDDDDDDDDDDDDDDDDDD', ownerId: OWNER.value });
    const { registry, handles } = aRegistry([noCapability]);

    const noCapabilityHandle = handles.get(noCapability.id.value) as RecordingHandle;
    noCapabilityHandle.capabilities = { ...noCapabilityHandle.capabilities, mcp: false };
    noCapabilityHandle.servers = [
      { name: 'github', status: 'connected', source: 'ours', toolCount: 1 },
    ];

    const status = await new SessionRegistryLiveMcpStatus(registry).statusFor(OWNER, ENGINE);

    expect(status.size).toBe(0);
  });

  it('surfaces the most urgent status when two live sessions disagree on the same name', async () => {
    const fine = aSession({ id: '01J0EEEEEEEEEEEEEEEEEEEEEE', ownerId: OWNER.value });
    const broken = aSession({ id: '01J0FFFFFFFFFFFFFFFFFFFFFF', ownerId: OWNER.value });
    const { registry, handles } = aRegistry([fine, broken]);

    (handles.get(fine.id.value) as RecordingHandle).servers = [
      { name: 'github', status: 'connected', source: 'ours', toolCount: 3 },
    ];
    (handles.get(broken.id.value) as RecordingHandle).servers = [
      { name: 'github', status: 'failed', source: 'ours', toolCount: 0 },
    ];

    const status = await new SessionRegistryLiveMcpStatus(registry).statusFor(OWNER, ENGINE);

    expect(status.get('github')).toBe('failed');
  });

  it('skips a session whose engine cannot answer right now, reading the others still', async () => {
    const broken = aSession({ id: '01J0GGGGGGGGGGGGGGGGGGGGGG', ownerId: OWNER.value });
    const fine = aSession({ id: '01J0HHHHHHHHHHHHHHHHHHHHHH', ownerId: OWNER.value });
    const { registry, handles } = aRegistry([broken, fine]);

    const brokenHandle = handles.get(broken.id.value) as RecordingHandle;
    brokenHandle.servers = [{ name: 'docs', status: 'connected', source: 'ours', toolCount: 1 }];
    brokenHandle.failWith = new Error('cli gone');

    (handles.get(fine.id.value) as RecordingHandle).servers = [
      { name: 'docs', status: 'connected', source: 'ours', toolCount: 1 },
    ];

    const status = await new SessionRegistryLiveMcpStatus(registry).statusFor(OWNER, ENGINE);

    expect(status.get('docs')).toBe('connected');
  });
});
