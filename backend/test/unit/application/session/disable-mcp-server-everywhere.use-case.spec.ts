import { describe, expect, it } from 'vitest';

import { DisableMcpServerEverywhereUseCase } from '@application/session';
import { UserId } from '@domain/auth';
import { aRegistry, aSession } from '../../../support/builders/session.builder';
import type { RecordingHandle } from '../../../support/builders/session.builder';
import { RecordingBroadcaster } from '../../../support/fakes/recording-broadcaster';

const owner = UserId.create('auth|owner');
const stranger = UserId.create('auth|stranger');
const ENGINE = 'claude';

describe('turning an MCP server off in every live session that has it — plan 13, B-23', () => {
  it('turns it off in every session of the owner that has it, and publishes the fresh status — S-97', async () => {
    const mine = aSession({ id: '01J0AAAAAAAAAAAAAAAAAAAAAA', ownerId: owner.value });
    const alsoMine = aSession({ id: '01J0BBBBBBBBBBBBBBBBBBBBBB', ownerId: owner.value });
    const { registry, handles } = aRegistry([mine, alsoMine]);
    const broadcaster = new RecordingBroadcaster();

    const mineHandle = handles.get(mine.id.value) as RecordingHandle;
    const alsoMineHandle = handles.get(alsoMine.id.value) as RecordingHandle;
    mineHandle.servers = [{ name: 'docs', status: 'connected', source: 'ours', toolCount: 1 }];
    alsoMineHandle.servers = [{ name: 'other', status: 'connected', source: 'ours', toolCount: 0 }];

    await new DisableMcpServerEverywhereUseCase(registry, broadcaster).execute(
      owner,
      ENGINE,
      'docs',
    );

    expect(mineHandle.mcpToggles).toEqual([{ name: 'docs', enabled: false }]);
    expect(alsoMineHandle.mcpToggles).toEqual([]);
    expect(broadcaster.events.map((entry) => entry.sessionId)).toEqual([mine.id.value]);
    expect(broadcaster.events[0]?.event).toMatchObject({
      type: 'session.mcpStatusChanged',
      payload: {
        servers: [{ name: 'docs', status: 'disabled', source: 'ours', toolCount: 1 }],
      },
    });
  });

  it('never touches a session of somebody else, even with the same server name', async () => {
    const theirs = aSession({ id: '01J0CCCCCCCCCCCCCCCCCCCCCC', ownerId: stranger.value });
    const { registry, handles } = aRegistry([theirs]);
    const handle = handles.get(theirs.id.value) as RecordingHandle;
    handle.servers = [{ name: 'docs', status: 'connected', source: 'ours', toolCount: 1 }];

    await new DisableMcpServerEverywhereUseCase(registry, new RecordingBroadcaster()).execute(
      owner,
      ENGINE,
      'docs',
    );

    expect(handle.mcpToggles).toEqual([]);
  });

  it('leaves a session without the server, or without the mcp capability, alone', async () => {
    const withoutServer = aSession({ id: '01J0DDDDDDDDDDDDDDDDDDDDDD', ownerId: owner.value });
    const withoutCapability = aSession({ id: '01J0EEEEEEEEEEEEEEEEEEEEEE', ownerId: owner.value });
    const { registry, handles } = aRegistry([withoutServer, withoutCapability]);

    const noServerHandle = handles.get(withoutServer.id.value) as RecordingHandle;
    noServerHandle.servers = [{ name: 'other', status: 'connected', source: 'ours', toolCount: 0 }];

    const noCapabilityHandle = handles.get(withoutCapability.id.value) as RecordingHandle;
    noCapabilityHandle.capabilities = { ...noCapabilityHandle.capabilities, mcp: false };
    noCapabilityHandle.servers = [
      { name: 'docs', status: 'connected', source: 'ours', toolCount: 1 },
    ];

    await new DisableMcpServerEverywhereUseCase(registry, new RecordingBroadcaster()).execute(
      owner,
      ENGINE,
      'docs',
    );

    expect(noServerHandle.mcpToggles).toEqual([]);
    expect(noCapabilityHandle.mcpToggles).toEqual([]);
  });

  it('one session whose engine fails does not stop the sweep from reaching the others', async () => {
    const broken = aSession({ id: '01J0FFFFFFFFFFFFFFFFFFFFFF', ownerId: owner.value });
    const fine = aSession({ id: '01J0GGGGGGGGGGGGGGGGGGGGGG', ownerId: owner.value });
    const { registry, handles } = aRegistry([broken, fine]);
    const broadcaster = new RecordingBroadcaster();

    const brokenHandle = handles.get(broken.id.value) as RecordingHandle;
    brokenHandle.servers = [{ name: 'docs', status: 'connected', source: 'ours', toolCount: 1 }];
    brokenHandle.failWith = new Error('cli gone');

    const fineHandle = handles.get(fine.id.value) as RecordingHandle;
    fineHandle.servers = [{ name: 'docs', status: 'connected', source: 'ours', toolCount: 1 }];

    await new DisableMcpServerEverywhereUseCase(registry, broadcaster).execute(
      owner,
      ENGINE,
      'docs',
    );

    expect(fineHandle.mcpToggles).toEqual([{ name: 'docs', enabled: false }]);
    expect(broadcaster.events.map((entry) => entry.sessionId)).toEqual([fine.id.value]);
  });

  it('asks nothing of an empty registry', async () => {
    const { registry } = aRegistry([]);
    const broadcaster = new RecordingBroadcaster();

    await expect(
      new DisableMcpServerEverywhereUseCase(registry, broadcaster).execute(owner, ENGINE, 'docs'),
    ).resolves.toBeUndefined();
    expect(broadcaster.events).toEqual([]);
  });
});
