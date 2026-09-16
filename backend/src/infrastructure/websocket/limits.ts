/**
 * What this server accepts, announced in `connection.ready` so a client learns it by being told
 * rather than by being refused.
 */
export const WS_LIMITS = {
  /** Largest frame accepted, in bytes. Over it the frame is refused; the socket stays. */
  maxFrameBytes: 65_536,

  /** Events kept per session for replay after a reconnect. */
  replayBufferSize: 1_000,
} as const;

/** Protocol versions this build speaks. */
export const SUPPORTED_VERSIONS = [1];

/** How long a fresh connection has to authenticate before it is closed. */
export const HANDSHAKE_TIMEOUT_MS = 5_000;

/** How long an expired credential may linger on an open socket before it is closed. */
export const REAUTH_GRACE_MS = 60_000;

/** Heartbeat: the server pings on this interval and closes if the pong is later than the second. */
export const HEARTBEAT_INTERVAL_MS = 30_000;
export const HEARTBEAT_TIMEOUT_MS = 10_000;

/** Close codes of docs/architecture/shared/05-websocket-protocol.md#códigos-de-fechamento. */
export const CLOSE = {
  normal: 1_000,
  shutdown: 1_001,
  protocolViolation: 4_400,
  authenticationFailed: 4_401,
  idleTimeout: 4_408,
  unsupportedVersion: 4_426,
} as const;
