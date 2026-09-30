import { afterEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';

import { permissionQueueOf } from '@/features/permission';
import { usePermissionAttachment } from '@/features/permission/hooks/usePermissionAttachment';
import { liveSessionStoreOf } from '@/features/session';
import { useLiveSessionAttachment } from '@/features/session/hooks/useLiveSessionAttachment';
import { ack, aLiveSocket, hubEvent } from '../../../../support/live-socket';
import type { LiveSocket } from '../../../../support/live-socket';

const SESSION = '01J0ABCDEFGHJKMNPQRSTVWXYZ';

/** The question the server asks, as a `request` frame with no sequence. */
const question = {
  v: 1,
  id: 'frame-1',
  kind: 'request',
  type: 'permission.requested',
  ts: '2026-09-30T12:00:00.000Z',
  sessionId: SESSION,
  payload: {
    requestId: 'req-1',
    toolUseId: 'toolu-1',
    toolName: 'Bash',
    title: 'permission.tool.Bash',
    description: 'ls',
    input: { command: 'ls' },
    riskHint: 'read',
    defaultToNo: false,
    expiresAt: '2026-09-30T12:01:00.000Z',
    suggestions: [{ scope: 'once', labelKey: 'permission.scope.once' }],
  },
};

/** What a folder tab holds for its session while it is not on screen — plan 06, S-181. */
describe('the attachments a folder tab holds', () => {
  let live: LiveSocket;

  afterEach(() => {
    live.close();
  });

  it('brings the conversation into the store of its session, and starts over on a gap', () => {
    live = aLiveSocket();
    renderHook(() => {
      useLiveSessionAttachment(SESSION);
    });
    live.connect();

    live.receive(hubEvent(SESSION, 'message.delta', 1, { messageId: 'm1', delta: 'hi' }));
    expect(liveSessionStoreOf(SESSION).getState().lastSeq).toBe(1);
    expect(live.lastSent('session.attach')).toMatchObject({
      payload: { sessionId: SESSION, resumeFromSeq: 0 },
    });

    live.receive(ack('session.attached', { sessionId: SESSION, gap: true, claudeSessionId: 'c1' }));
    expect(liveSessionStoreOf(SESSION).getState()).toMatchObject({ lastSeq: 0, historyFrom: 'c1' });
  });

  it('brings the questions into the queue of its session, and drops them on a gap', () => {
    live = aLiveSocket();
    renderHook(() => {
      usePermissionAttachment(SESSION);
    });
    live.connect();

    live.receive(question);
    expect(permissionQueueOf(SESSION).getState().pending).toHaveLength(1);

    live.receive(ack('session.attached', { sessionId: SESSION, gap: true }));
    expect(permissionQueueOf(SESSION).getState().pending).toEqual([]);
  });

  it('attaches nothing for no session', () => {
    live = aLiveSocket();
    renderHook(() => {
      useLiveSessionAttachment(null);
      usePermissionAttachment(null);
    });
    live.connect();

    expect(live.lastSent('session.attach')).toBeUndefined();
  });
});
