import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { WebSocketGateway } from '@nestjs/websockets';
import type { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { z } from 'zod';
import type { Envelope } from '@remote-claude/contracts';

import { AuthenticateUseCase, ResolveDeviceUseCase } from '@application/auth';
import { UnauthenticatedError } from '@domain/auth';
import type { IdGenerator } from '@domain/shared';
import { ID_GENERATOR } from '@application/shared';
import { WS_COMMAND_HANDLERS } from '@adapter/inbound/ws/ws-command';
import type { WsCommandHandler } from '@adapter/inbound/ws/ws-command';
import { InputValidationError } from '@shared/errors/input-validation.error';
import { UnsupportedProtocolVersionError } from '@shared/errors/unsupported-protocol-version.error';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { forLog } from '@shared/logging/redact';
import { runWithTrace } from '@shared/logging/trace-context';
import { ConnectionRegistry } from './connection-registry';
import type { Connection, Sendable } from './connection-registry';
import { decodeFrame } from './frame-codec';
import { FrameBuilder } from './frame-builder';
import {
  CLOSE,
  HANDSHAKE_TIMEOUT_MS,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  REAUTH_GRACE_MS,
  SUPPORTED_VERSIONS,
  WS_LIMITS,
} from './limits';
import { SessionHub } from './session-hub';

const authenticateSchema = z.object({
  token: z.string().min(1),
  locale: z.enum(['en', 'pt-BR']),
  client: z.object({
    kind: z.enum(['web', 'mobile']),
    version: z.string().min(1),
    // Absent from a browser, which is not a device. Present from the app, and it is what lets a
    // revocation close this socket at once rather than fifteen minutes from now.
    installId: z.string().min(1).optional(),
  }),
});

const reauthenticateSchema = z.object({ token: z.string().min(1) });

/** Kinds a client may send. Anything else on this socket is a protocol violation, not an error. */
const CLIENT_KINDS = new Set(['command', 'response']);

/** A raw socket, as `ws` hands it over. */
interface RawSocket extends Sendable {
  on(event: string, listener: (...args: never[]) => void): void;
  ping(): void;
  readyState: number;
}

/** Timers a connection owns, cleared together when it goes away. */
interface Timers {
  handshake: NodeJS.Timeout | null;
  credential: NodeJS.Timeout | null;
  heartbeat: NodeJS.Timeout | null;
  pong: NodeJS.Timeout | null;
}

/**
 * The WebSocket edge.
 *
 * It authenticates, validates the frame against the generated contract, finds the handler and
 * calls it. There is no business branch here by construction — see
 * docs/architecture/backend/06-realtime.md.
 *
 * Only two things close a socket: a failed handshake (`4401`) and a protocol violation (`4400`,
 * and `4426` for a version this build cannot speak). A bad command is answered with an `error`
 * frame and the connection carries on; dropping it would make one typo cost a reconnect.
 */
@Injectable()
@WebSocketGateway({ path: '/ws' })
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  private readonly timers = new Map<string, Timers>();
  private readonly sockets = new Map<string, RawSocket>();

  constructor(
    @Inject(ConnectionRegistry) private readonly registry: ConnectionRegistry,
    @Inject(SessionHub) private readonly hub: SessionHub,
    @Inject(FrameBuilder) private readonly frames: FrameBuilder,
    @Inject(AuthenticateUseCase) private readonly authenticate: AuthenticateUseCase,
    @Inject(ResolveDeviceUseCase) private readonly devices: ResolveDeviceUseCase,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(WS_COMMAND_HANDLERS) private readonly handlers: readonly WsCommandHandler[],
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  handleConnection(socket: RawSocket): void {
    const connection = this.registry.register(this.ids.next(), socket);
    this.sockets.set(connection.id, socket);

    this.timers.set(connection.id, {
      // No `connection.authenticate` inside the window and the socket goes. An unauthenticated
      // socket kept alive "just in case" is an unauthenticated socket.
      handshake: setTimeout(() => {
        this.close(connection, CLOSE.authenticationFailed, 'handshake timed out');
      }, HANDSHAKE_TIMEOUT_MS),
      credential: null,
      heartbeat: setInterval(() => {
        this.beat(connection, socket);
      }, HEARTBEAT_INTERVAL_MS),
      pong: null,
    });

    socket.on('message', (data: never) => {
      void this.onMessage(connection, String(data));
    });
    socket.on('pong', () => {
      this.clearTimer(connection.id, 'pong');
    });

    this.logger.debug(
      { op: 'ws.connection', layer: 'infrastructure', connectionId: connection.id },
      'ws connection opened',
    );
  }

  handleDisconnect(socket: RawSocket): void {
    const id = [...this.sockets.entries()].find(([, known]) => known === socket)?.[0];
    if (id === undefined) {
      return;
    }

    this.forget(id);
  }

  onModuleDestroy(): void {
    for (const [id, socket] of this.sockets) {
      socket.close(CLOSE.shutdown, 'server shutting down');
      this.forget(id);
    }
  }

  /** One inbound frame, from bytes to answer. */
  private async onMessage(connection: Connection, raw: string): Promise<void> {
    let frame: Envelope;

    try {
      frame = decodeFrame(raw, WS_LIMITS.maxFrameBytes);
    } catch (error) {
      this.refuseUndecodable(connection, error);
      return;
    }

    const traceId = frame.traceId ?? this.ids.next();

    await runWithTrace({ traceId }, async () => {
      const logged = forLog(frame.payload);
      this.logger.debug(
        {
          op: 'ws.inbound',
          layer: 'infrastructure',
          connectionId: connection.id,
          kind: frame.kind,
          type: frame.type,
          payload: logged.payload,
          truncated: logged.truncated,
        },
        'ws frame received',
      );

      if (!CLIENT_KINDS.has(frame.kind)) {
        this.close(connection, CLOSE.protocolViolation, `kind ${frame.kind} is server to client`);
        return;
      }

      try {
        await this.route(connection, frame, traceId);
      } catch (error) {
        this.logger.warn(
          {
            op: 'ws.command',
            layer: 'infrastructure',
            connectionId: connection.id,
            type: frame.type,
            err: error,
          },
          'ws command refused',
        );
        this.hub.deliver(connection, this.frames.error(error, traceId, frame.id));
      }
    });
  }

  /** Handshake first, then everything else — and nothing else before the handshake. */
  private async route(connection: Connection, frame: Envelope, traceId: string): Promise<void> {
    if (frame.type === 'connection.authenticate') {
      await this.handshake(connection, frame, traceId);
      return;
    }

    if (frame.type === 'connection.reauthenticate') {
      await this.reauthenticate(connection, frame, traceId);
      return;
    }

    const userId = connection.userId;
    if (userId === null) {
      throw new UnauthenticatedError('command arrived before the handshake');
    }

    const handler = this.handlers.find((candidate) => candidate.type === frame.type);
    if (handler === undefined) {
      throw new InputValidationError([{ field: 'type', rule: 'unknownCommand' }]);
    }

    const outcome = await handler.handle({
      connectionId: connection.id,
      userId,
      installId: connection.installId,
      locale: connection.locale,
      setLocale: (locale) => {
        connection.locale = locale;
      },
      frame,
      attach: (sessionId) => connection.attached.add(sessionId),
      detach: (sessionId) => {
        connection.attached.delete(sessionId);
      },
      isAttached: (sessionId) => connection.attached.has(sessionId),
      replay: (sessionId, resumeFromSeq) => this.hub.replay(sessionId, resumeFromSeq),
      publish: (sessionId, event) => {
        this.hub.publish(sessionId, event);
      },
    });

    // The ack first, then the replay, then the fan-out: a client learns that its command was
    // accepted before anything caused by it arrives.
    this.send(connection, 'ack', outcome.ack.type, outcome.ack.payload, traceId, frame.id);
    for (const event of outcome.then) {
      this.hub.deliver(connection, event);
    }
    outcome.publish();
  }

  private async handshake(connection: Connection, frame: Envelope, traceId: string): Promise<void> {
    if (connection.userId !== null) {
      throw new InputValidationError([{ field: 'type', rule: 'alreadyAuthenticated' }]);
    }

    const parsed = authenticateSchema.safeParse(frame.payload ?? {});
    if (!parsed.success) {
      this.close(connection, CLOSE.authenticationFailed, 'handshake payload is invalid');
      return;
    }

    let authentication;
    try {
      authentication = await this.authenticate.execute(parsed.data.token);
    } catch {
      // The socket goes, and the reason does not: the response never says which check failed.
      this.close(connection, CLOSE.authenticationFailed, 'token rejected');
      return;
    }

    const installId = parsed.data.client.installId ?? null;

    try {
      // A device that has been revoked, or one nobody ever registered, does not get a socket at
      // all. A **pending** one does: watching a session is allowed to a device that cannot yet
      // decide anything, and hiding the stream from it would turn "wait to be approved" into "the
      // app is broken" (S-03).
      const device = await this.devices.execute(authentication.userId, installId);
      if (device !== null && device.status === 'revoked') {
        this.close(connection, CLOSE.authenticationFailed, 'device revoked');
        return;
      }
    } catch {
      this.close(connection, CLOSE.authenticationFailed, 'unknown device');
      return;
    }

    connection.userId = authentication.userId;
    connection.locale = parsed.data.locale;
    connection.installId = installId;
    connection.expiresAt = authentication.expiresAt;

    this.clearTimer(connection.id, 'handshake');
    this.scheduleCredentialExpiry(connection, authentication.expiresAt);

    this.logger.info(
      {
        op: 'ws.connection',
        layer: 'infrastructure',
        module: 'auth',
        connectionId: connection.id,
        userId: authentication.userId.value,
        client: parsed.data.client.kind,
      },
      'ws connection authenticated',
    );

    this.send(
      connection,
      'ack',
      'connection.ready',
      {
        connectionId: connection.id,
        serverVersion: String(SUPPORTED_VERSIONS[0]),
        limits: {
          maxFrameBytes: WS_LIMITS.maxFrameBytes,
          replayBufferSize: WS_LIMITS.replayBufferSize,
        },
      },
      traceId,
      frame.id,
    );
  }

  private async reauthenticate(
    connection: Connection,
    frame: Envelope,
    traceId: string,
  ): Promise<void> {
    const parsed = reauthenticateSchema.safeParse(frame.payload ?? {});
    if (!parsed.success) {
      this.close(connection, CLOSE.authenticationFailed, 'reauthenticate payload is invalid');
      return;
    }

    let authentication;
    try {
      authentication = await this.authenticate.execute(parsed.data.token);
    } catch {
      this.close(connection, CLOSE.authenticationFailed, 'renewed token rejected');
      return;
    }

    connection.userId = authentication.userId;
    connection.expiresAt = authentication.expiresAt;
    this.scheduleCredentialExpiry(connection, authentication.expiresAt);

    this.send(
      connection,
      'ack',
      'command.accepted',
      { command: 'connection.reauthenticate' },
      traceId,
      frame.id,
    );
  }

  /**
   * An access token expiring on an open socket does not drop it.
   *
   * The client renews and sends `connection.reauthenticate`; only silence past the grace period
   * closes the connection. See docs/architecture/shared/08-authentication.md#token-no-websocket.
   */
  private scheduleCredentialExpiry(connection: Connection, expiresAt: Date): void {
    this.clearTimer(connection.id, 'credential');

    const delay = Math.max(0, expiresAt.getTime() - Date.now() + REAUTH_GRACE_MS);
    const timers = this.timers.get(connection.id);
    if (timers === undefined) {
      return;
    }

    timers.credential = setTimeout(() => {
      this.close(connection, CLOSE.authenticationFailed, 'credential expired without renewal');
    }, delay);
  }

  private beat(connection: Connection, socket: RawSocket): void {
    const timers = this.timers.get(connection.id);
    if (timers === undefined) {
      return;
    }

    timers.pong = setTimeout(() => {
      this.close(connection, CLOSE.idleTimeout, 'no pong within the heartbeat window');
    }, HEARTBEAT_TIMEOUT_MS);

    socket.ping();
  }

  /** A frame that could not even be decoded. Version mismatch closes; everything else answers. */
  private refuseUndecodable(connection: Connection, error: unknown): void {
    if (error instanceof UnsupportedProtocolVersionError) {
      // The error frame goes first, and it is the only way the client learns which versions this
      // build speaks: a close frame carries a code and a reason, never a payload. Without it the
      // only thing an app on a store could tell its user is "it did not work".
      this.hub.deliver(connection, this.frames.error(error, this.ids.next()));
      this.close(connection, CLOSE.unsupportedVersion, 'unsupported protocol version');
      return;
    }

    this.hub.deliver(connection, this.frames.error(error, this.ids.next()));
  }

  private send(
    connection: Connection,
    kind: Envelope['kind'],
    type: string,
    payload: Readonly<Record<string, unknown>>,
    traceId: string,
    correlationId: string,
  ): void {
    this.hub.deliver(
      connection,
      this.frames.build({ kind, type, payload, traceId, correlationId }),
    );
  }

  private close(connection: Connection, code: number, reason: string): void {
    this.logger.warn(
      {
        op: 'ws.connection',
        layer: 'infrastructure',
        connectionId: connection.id,
        closeCode: code,
      },
      reason,
    );

    this.sockets.get(connection.id)?.close(code, reason);
    this.forget(connection.id);
  }

  private clearTimer(connectionId: string, name: keyof Timers): void {
    const timers = this.timers.get(connectionId);
    const timer = timers?.[name];

    if (timers === undefined || timer === null || timer === undefined) {
      return;
    }

    clearTimeout(timer);
    clearInterval(timer);
    timers[name] = null;
  }

  /** Drops every trace of a connection. Called from close, from disconnect and from shutdown. */
  private forget(connectionId: string): void {
    for (const name of ['handshake', 'credential', 'heartbeat', 'pong'] as const) {
      this.clearTimer(connectionId, name);
    }

    this.timers.delete(connectionId);
    this.sockets.delete(connectionId);
    this.registry.remove(connectionId);
  }
}
