import type { AppConfig } from '../config/environment';

/** Events kept per session for replay after a reconnect. */
export const REPLAY_BUFFER_SIZE = 1_000;

/** Protocol versions this build speaks. */
export const SUPPORTED_VERSIONS = [1];

/** How long a fresh connection has to authenticate before it is closed. */
export const HANDSHAKE_TIMEOUT_MS = 5_000;

/** How long an expired credential may linger on an open socket before it is closed. */
export const REAUTH_GRACE_MS = 60_000;

/** Heartbeat: the server pings on this interval and closes if the pong is later than the second. */
export const HEARTBEAT_INTERVAL_MS = 30_000;
export const HEARTBEAT_TIMEOUT_MS = 10_000;

/**
 * How long a client refused for its rate has to back off, in seconds.
 *
 * One second: the bucket refills in one. A frame inside that window is the client not having
 * listened, and that closes the socket with `4429` (docs/architecture/backend/06-realtime.md).
 */
export const RATE_LIMIT_RETRY_AFTER_SECONDS = 1;

/** Close codes of docs/architecture/shared/05-websocket-protocol.md#códigos-de-fechamento. */
export const CLOSE = {
  normal: 1_000,
  shutdown: 1_001,
  protocolViolation: 4_400,
  authenticationFailed: 4_401,
  idleTimeout: 4_408,
  unsupportedVersion: 4_426,
  rateLimited: 4_429,
} as const;

/**
 * Everything the gateway holds a connection to.
 *
 * The three limits a client can meet come from configuration and are announced in
 * `connection.ready`, so a client learns them by being told rather than by being refused (B-06).
 * The timings are the protocol's own and are not configured — they are here, in one object, so a
 * suite can shorten the heartbeat instead of waiting thirty seconds for it (B-07).
 */
export interface WsSettings {
  readonly maxFramesPerSecond: number;
  readonly maxFrameBytes: number;
  readonly maxAttachedSessions: number;
  readonly replayBufferSize: number;
  readonly handshakeTimeoutMs: number;
  readonly reauthGraceMs: number;
  readonly heartbeatIntervalMs: number;
  readonly heartbeatTimeoutMs: number;
}

/** The settings of this installation: its configured limits, and the protocol's timings. */
export function wsSettingsFrom(config: Pick<AppConfig, 'websocket'>): WsSettings {
  return {
    ...config.websocket,
    replayBufferSize: REPLAY_BUFFER_SIZE,
    handshakeTimeoutMs: HANDSHAKE_TIMEOUT_MS,
    reauthGraceMs: REAUTH_GRACE_MS,
    heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
    heartbeatTimeoutMs: HEARTBEAT_TIMEOUT_MS,
  };
}

/** What `connection.ready` announces: exactly what a client can run into. */
export function announcedLimits(settings: WsSettings): Readonly<Record<string, number>> {
  return {
    maxFrameBytes: settings.maxFrameBytes,
    maxFramesPerSecond: settings.maxFramesPerSecond,
    maxAttachedSessions: settings.maxAttachedSessions,
    replayBufferSize: settings.replayBufferSize,
  };
}

/** DI token of the gateway's settings. */
export const WS_SETTINGS = Symbol('WsSettings');
