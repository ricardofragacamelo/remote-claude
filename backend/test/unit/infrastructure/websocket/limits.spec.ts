import { describe, expect, it } from 'vitest';

import {
  announcedLimits,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  REPLAY_BUFFER_SIZE,
  wsSettingsFrom,
} from '@infra/websocket/limits';

const websocket = { maxFramesPerSecond: 20, maxFrameBytes: 65_536, maxAttachedSessions: 16 };

describe('the settings of the gateway — B-06', () => {
  it('takes the limits from configuration and the timings from the protocol', () => {
    expect(wsSettingsFrom({ websocket })).toMatchObject({
      ...websocket,
      replayBufferSize: REPLAY_BUFFER_SIZE,
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
      heartbeatTimeoutMs: HEARTBEAT_TIMEOUT_MS,
    });
  });

  it('announces exactly what a client can run into, and no timing', () => {
    expect(announcedLimits(wsSettingsFrom({ websocket }))).toEqual({
      maxFrameBytes: 65_536,
      maxFramesPerSecond: 20,
      maxAttachedSessions: 16,
      replayBufferSize: REPLAY_BUFFER_SIZE,
    });
  });
});
