import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  DEVICE_STATUS_CHANNEL,
  HttpPushSender,
  deliveryOf,
  retryAfterOf,
} from '@adapter/outbound/push/http-push.adapter';
import { PushAccessTokenCache } from '@adapter/outbound/push/push-access-token.cache';
import { DeviceLocale } from '@domain/auth';
import { PushMessage } from '@domain/notification';
import type { PermissionReference, PushTarget } from '@domain/notification';
import type { AppConfig } from '@infra/config/environment';
import { PushTranslator } from '@shared/i18n/push-translator';
import { FixedClock } from '../../../../support/fakes/fixed-clock';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';

const target: PushTarget = {
  deviceId: 'dev_1',
  token: 'a-very-long-push-token-abcdef',
  locale: DeviceLocale.create('pt-BR'),
};

const reference: PermissionReference = {
  sessionId: 'ses-1',
  requestId: 'req-1',
  expiresAt: '2026-09-18T10:02:00.000Z',
};

/**
 * Only the three values the adapter reads. The rest of the configuration is not its business.
 *
 * The credentials file is real, because the adapter reads it before it reaches the provider —
 * pointing at a path that is not there would test the failure path in every case.
 */
let config: AppConfig;

beforeAll(() => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'rc-push-')), 'credentials.json');

  writeFileSync(
    file,
    JSON.stringify({
      client_email: 'push@service.invalid',
      private_key: 'unused: the exchange is stubbed out',
      token_uri: 'https://exchange.invalid/token',
    }),
    'utf8',
  );

  config = {
    push: {
      endpoint: 'https://push.invalid/v1/messages:send',
      credentialsFile: file,
      scope: 'https://push.invalid/auth',
    },
  } as AppConfig;
});

/** The provider's endpoint, answering what the test queued and keeping what it was sent. */
class ScriptedProvider {
  readonly calls: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
  status = 200;
  headers: Record<string, string> = {};
  throws: Error | null = null;

  readonly fetch: typeof fetch = (input, init) => {
    if (this.throws !== null) {
      return Promise.reject(this.throws);
    }

    this.calls.push({
      url: String(input),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
    });

    return Promise.resolve(new Response('{}', { status: this.status, headers: this.headers }));
  };

  /** The `message` of the single call, which is the only thing these tests assert on. */
  get message(): Record<string, unknown> {
    expect(this.calls).toHaveLength(1);
    return this.calls[0]?.body['message'] as Record<string, unknown>;
  }
}

/** A token cache that never reaches a provider: the exchange has its own suite. */
class GrantedTokens extends PushAccessTokenCache {
  forgotten = 0;

  constructor() {
    super('scope', new FixedClock(new Date()));
  }

  override token(): Promise<string> {
    return Promise.resolve('granted');
  }

  override forget(): void {
    this.forgotten += 1;
  }
}

let provider: ScriptedProvider;
let tokens: GrantedTokens;
let logger: RecordingLogger;

beforeEach(() => {
  provider = new ScriptedProvider();
  tokens = new GrantedTokens();
  logger = new RecordingLogger();
});

const sender = (): HttpPushSender =>
  new HttpPushSender(config, tokens, new PushTranslator(), logger.logger, provider.fetch);

describe('what a status means', () => {
  it.each([200, 201, 204])('%d is delivered', (status) => {
    expect(deliveryOf(status)).toBe('delivered');
  });

  // Permanent, not a blip: the token is erased and the device stays approved (D-13).
  it.each([404, 410])('%d means the token is gone', (status) => {
    expect(deliveryOf(status)).toBe('tokenRejected');
  });

  // D-09: what may pass is tried again; what the provider refused for good is not.
  it.each([401, 408, 429, 500, 502, 503])('%d is a failure worth another try', (status) => {
    expect(deliveryOf(status)).toBe('failed');
  });

  it.each([400, 403, 413, 499])('%d is refused for good', (status) => {
    expect(deliveryOf(status)).toBe('rejected');
  });
});

describe('sending a question', () => {
  const question = (): PushMessage =>
    PushMessage.permissionRequested(target, reference, { toolName: 'Bash' });

  it('posts to the configured endpoint, with the token it was granted', async () => {
    await sender().send(question());

    expect(provider.calls[0]?.url).toBe('https://push.invalid/v1/messages:send');
    expect(provider.calls[0]?.headers.get('authorization')).toBe('Bearer granted');
  });

  it('carries the two sentences, rendered in the device language — S-17', async () => {
    await sender().send(question());

    const notification = provider.message['notification'] as Record<string, string>;
    expect(notification['title']).toBe(new PushTranslator().permission('pt-BR', {}).title);
    expect(notification['body']).toContain('Bash');
  });

  // S-20
  it('carries the session, the request and the deadline — S-20', async () => {
    await sender().send(question());

    expect(provider.message['data']).toEqual({
      kind: 'permissionRequested',
      sessionId: 'ses-1',
      requestId: 'req-1',
      expiresAt: '2026-09-18T10:02:00.000Z',
    });
  });

  // D-15: a second delivery of the same question replaces the first rather than stacking.
  it('tags the notification with the request', async () => {
    await sender().send(question());

    const android = provider.message['android'] as Record<string, Record<string, string>>;
    expect(android['notification']?.['tag']).toBe('req-1');
  });

  it('answers delivered', async () => {
    expect(await sender().send(question())).toEqual({ delivery: 'delivered', retryAfterMs: null });
  });
});

describe('sending a question of Claude — plan 24, D-22', () => {
  it('says there is a question, in the device language, and nothing of what it asks — S-52', async () => {
    await sender().send(PushMessage.questionAsked(target, reference));

    expect(provider.message['notification']).toEqual(new PushTranslator().question('pt-BR'));
    expect(provider.message['data']).toEqual({
      kind: 'permissionRequested',
      sessionId: 'ses-1',
      requestId: 'req-1',
      expiresAt: '2026-09-18T10:02:00.000Z',
    });
  });
});

describe('withdrawing one', () => {
  const withdrawal = (): PushMessage => PushMessage.permissionResolved(target, reference);

  // A message with words would show a second notification saying the first one is over.
  it('carries no words at all', async () => {
    await sender().send(withdrawal());

    expect(provider.message['notification']).toBeUndefined();
  });

  it('still names the session, the request and the deadline', async () => {
    await sender().send(withdrawal());

    expect(provider.message['data']).toMatchObject({
      kind: 'permissionResolved',
      requestId: 'req-1',
    });
  });
});

describe('telling a phone it was approved — plan 17, F3', () => {
  const approval = (): PushMessage => PushMessage.deviceApproved(target);

  // S-121 · the sentence in the device's language, and only the device in `data`.
  it('carries the two sentences in the device language, and only the kind and the device', async () => {
    await sender().send(approval());

    const notification = provider.message['notification'] as Record<string, string>;
    expect(notification).toEqual(new PushTranslator().deviceApproved('pt-BR'));
    expect(provider.message['data']).toEqual({ kind: 'deviceApproved', deviceId: 'dev_1' });
  });

  it('goes on the channel of the device status, tagged by the device', async () => {
    await sender().send(approval());

    const android = provider.message['android'] as Record<string, Record<string, string>>;
    expect(android['notification']).toEqual({
      tag: 'device:dev_1',
      channel_id: DEVICE_STATUS_CHANNEL,
    });
  });

  it('logs the device, no request, and never the token', async () => {
    await sender().send(approval());

    const line = logger.withOp('push.send')[0];
    expect(line).toMatchObject({ kind: 'deviceApproved', deviceId: 'dev_1', requestId: null });
    expect(JSON.stringify(line)).not.toContain(target.token);
  });
});

describe('when it does not work', () => {
  const question = (): PushMessage =>
    PushMessage.permissionRequested(target, reference, { toolName: 'Bash' });

  it('answers tokenRejected without throwing — the caller erases the token', async () => {
    provider.status = 410;

    expect((await sender().send(question())).delivery).toBe('tokenRejected');
  });

  it('answers failed for what may pass', async () => {
    provider.status = 503;

    expect((await sender().send(question())).delivery).toBe('failed');
  });

  it('answers rejected for a message the provider refused for good', async () => {
    provider.status = 400;

    expect((await sender().send(question())).delivery).toBe('rejected');
  });

  it("carries the provider's Retry-After, in milliseconds — B-25", async () => {
    provider.status = 429;
    provider.headers = { 'retry-after': '7' };

    expect(await sender().send(question())).toEqual({ delivery: 'failed', retryAfterMs: 7_000 });
  });

  // A provider that could throw would be a provider that can hold a permission open.
  it('answers failed when the credentials cannot be read, and reads them again next time', async () => {
    const missing = path.join(mkdtempSync(path.join(tmpdir(), 'rc-push-')), 'credentials.json');
    const late = new HttpPushSender(
      { push: { ...config.push, credentialsFile: missing } } as AppConfig,
      tokens,
      new PushTranslator(),
      logger.logger,
      provider.fetch,
    );

    expect((await late.send(question())).delivery).toBe('failed');
    expect(provider.calls).toHaveLength(0);

    writeFileSync(missing, readFileSync(config.push.credentialsFile, 'utf8'), 'utf8');

    expect((await late.send(question())).delivery).toBe('delivered');
  });

  it('answers failed when the provider cannot be reached at all', async () => {
    provider.throws = new Error('the network is not there');

    expect(await sender().send(question())).toEqual({ delivery: 'failed', retryAfterMs: null });
  });

  it('drops the held token on a 401, so the next message mints a fresh one', async () => {
    provider.status = 401;

    await sender().send(question());

    expect(tokens.forgotten).toBe(1);
  });

  it('keeps the held token on every other failure', async () => {
    provider.status = 503;

    await sender().send(question());

    expect(tokens.forgotten).toBe(0);
  });
});

describe('what it says in the log', () => {
  const question = (): PushMessage =>
    PushMessage.permissionRequested(target, reference, { toolName: 'Bash' });

  // S-14, at this edge: the token reaches somebody's phone, so it never reaches a log whole.
  it('logs the last six characters of the token and never the token — S-14', async () => {
    await sender().send(question());

    const line = logger.withOp('push.send')[0];
    expect(line?.['pushTokenTail']).toBe('abcdef');
    expect(JSON.stringify(logger.lines)).not.toContain('a-very-long-push-token');
  });

  it('logs a delivery and a failed attempt at debug, and a refusal at warn — S-48', async () => {
    // A failed attempt is tried again; the one warn is the dispatcher's, when it gives up.
    await sender().send(question());
    provider.status = 503;
    await sender().send(question());
    provider.status = 400;
    await sender().send(question());

    expect(logger.withOp('push.send').map((line) => line.level)).toEqual([
      'debug',
      'debug',
      'warn',
    ]);
  });

  it('says which request and which device, and how long it took', async () => {
    await sender().send(question());

    expect(logger.withOp('push.send')[0]).toMatchObject({
      requestId: 'req-1',
      deviceId: 'dev_1',
      delivery: 'delivered',
    });
    expect(logger.withOp('push.send')[0]?.['durationMs']).toBeTypeOf('number');
  });
});

describe("the provider's Retry-After", () => {
  const now = Date.parse('2026-09-18T10:00:00.000Z');

  it('reads a number of seconds', () => {
    expect(retryAfterOf('30', now)).toBe(30_000);
  });

  it('reads an HTTP date, as the time left until it', () => {
    expect(retryAfterOf('Fri, 18 Sep 2026 10:00:05 GMT', now)).toBe(5_000);
  });

  it('reads a date already past as no wait at all', () => {
    expect(retryAfterOf('Fri, 18 Sep 2026 09:59:00 GMT', now)).toBe(0);
  });

  it.each([null, '', '   ', 'soon'])('ignores %j rather than guessing', (header) => {
    expect(retryAfterOf(header, now)).toBeNull();
  });
});
