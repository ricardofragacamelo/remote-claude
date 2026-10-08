import { Inject, Injectable } from '@nestjs/common';

import type { PushDelivery, PushOutcome, PushSender } from '@application/notification';
import type { PushMessage } from '@domain/notification';
import { APP_CONFIG } from '@infra/config/environment';
import type { AppConfig } from '@infra/config/environment';
import { LOGGER, type Logger } from '@shared/logging/logger';
import { PushAccessTokenCache } from './push-access-token.cache';
import { PUSH_ACCESS_TOKENS, PUSH_TEXT } from './push.tokens';
import { readPushCredentials } from './push-credentials';
import type { PushCredentials } from './push-credentials';
import type { PushTranslator } from '@shared/i18n/push-translator';

/** Statuses that mean the token is gone for good, not that the call went badly. */
const TOKEN_IS_GONE = new Set([404, 410]);

/**
 * `4xx` statuses that may pass, and are worth asking again: a timeout, the provider's own rate
 * limit, and a `401` on an access token that is dropped and minted afresh for the next attempt.
 * Every other `4xx` is the provider refusing the message itself (D-09).
 */
const TRANSIENT_CLIENT_ERRORS = new Set([401, 408, 429]);

/** How many trailing characters of a token may be logged. Enough to tell two apart, no more. */
const TOKEN_TAIL = 6;

/**
 * The Android channel of the messages about the phone itself, apart from the permission requests'
 * — muting one is not muting the other. The app creates it; an app too old to have created it
 * falls back to the default channel, and still shows the sentence (plan 17, D-14).
 */
export const DEVICE_STATUS_CHANNEL = 'device_status';

/**
 * The push provider, and the only thing in this backend that has met it.
 *
 * It knows an endpoint, a credential file and a scope — all three from configuration — and it
 * does not know the name of whoever is on the other end. That is the same rule the identity
 * provider lives under, and for the same reason: changing provider has to be a change of
 * configuration ([AGENTS.md](../../../../../AGENTS.md)).
 *
 * **It never throws.** Every failure is a `PushDelivery`, because the caller is announcing a
 * question that is already valid on the web, beside a deadline that is already running. A
 * provider that could throw would be a provider that can hold a permission open
 * ([D-05](../../../../../docs/plans/02-mobile-approval/decisions.md#d-05--quando-o-push-não-sai)).
 */
@Injectable()
export class HttpPushSender implements PushSender {
  private credentials: Promise<PushCredentials> | null = null;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PUSH_ACCESS_TOKENS) private readonly tokens: PushAccessTokenCache,
    @Inject(PUSH_TEXT) private readonly text: PushTranslator,
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly http: typeof fetch = fetch,
  ) {}

  async send(message: PushMessage): Promise<PushOutcome> {
    const startedAt = Date.now();

    try {
      const response = await this.post(message);
      const delivery = deliveryOf(response.status);
      const retryAfterMs = retryAfterOf(response.headers.get('retry-after'), Date.now());

      this.report(message, delivery, { httpStatus: response.status, retryAfterMs, startedAt });

      if (response.status === 401) {
        // The held token was refused. Dropping it means the next attempt mints a fresh one rather
        // than repeating a call that cannot work.
        this.tokens.forget();
      }

      return { delivery, retryAfterMs };
    } catch (error) {
      this.report(message, 'failed', { err: error, startedAt });
      return { delivery: 'failed', retryAfterMs: null };
    }
  }

  private async post(message: PushMessage): Promise<Response> {
    const credentials = await this.load();
    const token = await this.tokens.token(credentials);

    return this.http(this.config.push.endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ message: this.body(message) }),
    });
  }

  /**
   * The payload, with the two halves a phone needs and nothing else.
   *
   * `data` carries the session, the request and the deadline — what the tap needs to open the
   * right card — and **never** the content of a file or the output of a command: this message
   * passes through somebody else's server (S-19, S-20).
   *
   * The cancellation carries no `notification` at all. A message with words would show a second
   * notification saying the first one is over, which is worse than the one it was withdrawing.
   */
  private body(message: PushMessage): Readonly<Record<string, unknown>> {
    const reference = message.reference;

    if (reference === null) {
      // About the phone itself: the device it is going to, and nothing else crosses.
      const text = this.text.deviceApproved(message.target.locale.value);

      return {
        token: message.target.token,
        notification: { title: text.title, body: text.body },
        data: { kind: message.kind, deviceId: message.target.deviceId },
        android: {
          priority: 'high',
          notification: { tag: message.tag, channel_id: DEVICE_STATUS_CHANNEL },
        },
      };
    }

    const data = {
      kind: message.kind,
      sessionId: reference.sessionId,
      requestId: reference.requestId,
      expiresAt: reference.expiresAt,
    };

    if (message.isSilent) {
      return { token: message.target.token, data, android: { priority: 'high' } };
    }

    const text =
      message.subject === 'question'
        ? this.text.question(message.target.locale.value)
        : this.text.permission(message.target.locale.value, message.params);

    return {
      token: message.target.token,
      notification: { title: text.title, body: text.body },
      data,
      // One notification per request: the tag is the request, so a second delivery of the same
      // question replaces the first rather than stacking beside it (D-15).
      android: { priority: 'high', notification: { tag: message.tag } },
    };
  }

  /** The credentials, read once. A file that cannot be read is re-read on the next attempt. */
  private async load(): Promise<PushCredentials> {
    this.credentials ??= readPushCredentials(this.config.push.credentialsFile).catch(
      (error: unknown) => {
        this.credentials = null;
        throw error;
      },
    );

    return this.credentials;
  }

  /**
   * One line per attempt, at the level the outcome deserves.
   *
   * A refused token is `warn` and not `error`: it is the ordinary consequence of an operating
   * system rotating a token, and the caller already erases it. A `failed` attempt is `debug`: it is
   * tried again, and the one `warn` is the dispatcher's, when it gives up, with the number of
   * attempts (S-48). The token itself never appears — only its last six characters, which tell two
   * registrations apart and reach nobody's phone.
   */
  private report(
    message: PushMessage,
    delivery: PushDelivery,
    context: Readonly<Record<string, unknown>>,
  ): void {
    const { startedAt, ...rest } = context as { startedAt: number };

    const line = {
      op: 'push.send',
      layer: 'adapter',
      module: 'notification',
      kind: message.kind,
      requestId: message.reference?.requestId ?? null,
      deviceId: message.target.deviceId,
      pushTokenTail: message.target.token.slice(-TOKEN_TAIL),
      delivery,
      durationMs: Date.now() - startedAt,
      ...rest,
    };

    if (delivery === 'delivered') {
      this.logger.debug(line, 'push sent');
    } else if (delivery === 'failed') {
      this.logger.debug(line, 'push attempt failed');
    } else {
      this.logger.warn(line, 'push not delivered');
    }
  }
}

/** What a status means: delivered, the token gone, refused for good, or worth another try. */
export function deliveryOf(status: number): PushDelivery {
  if (status >= 200 && status < 300) {
    return 'delivered';
  }

  if (TOKEN_IS_GONE.has(status)) {
    return 'tokenRejected';
  }

  const refusedForGood = status >= 400 && status < 500 && !TRANSIENT_CLIENT_ERRORS.has(status);
  return refusedForGood ? 'rejected' : 'failed';
}

/**
 * The provider's `Retry-After`, in milliseconds, or `null` when it did not say.
 *
 * Both forms of the header: a number of seconds, or an HTTP date. A date already past is zero; a
 * header that is neither is ignored rather than guessed at.
 */
export function retryAfterOf(header: string | null, nowMs: number): number | null {
  if (header === null || header.trim() === '') {
    return null;
  }

  const trimmed = header.trim();

  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1_000;
  }

  const at = Date.parse(trimmed);
  return Number.isNaN(at) ? null : Math.max(0, at - nowMs);
}
