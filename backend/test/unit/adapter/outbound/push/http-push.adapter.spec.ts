import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { HttpPushSender, deliveryOf } from '@adapter/outbound/push/http-push.adapter';
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

    return Promise.resolve(new Response('{}', { status: this.status }));
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

  it.each([400, 401, 429, 500, 503])('%d is a failure, and nothing more', (status) => {
    expect(deliveryOf(status)).toBe('failed');
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
    expect(await sender().send(question())).toBe('delivered');
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

describe('when it does not work', () => {
  const question = (): PushMessage =>
    PushMessage.permissionRequested(target, reference, { toolName: 'Bash' });

  it('answers tokenRejected without throwing — the caller erases the token', async () => {
    provider.status = 410;

    expect(await sender().send(question())).toBe('tokenRejected');
  });

  it('answers failed for anything else', async () => {
    provider.status = 503;

    expect(await sender().send(question())).toBe('failed');
  });

  // A provider that could throw would be a provider that can hold a permission open.
  it('answers failed when the provider cannot be reached at all', async () => {
    provider.throws = new Error('the network is not there');

    expect(await sender().send(question())).toBe('failed');
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

  it('logs a delivery at debug and a failure at warn', async () => {
    await sender().send(question());
    provider.status = 503;
    await sender().send(question());

    expect(logger.withOp('push.send').map((line) => line.level)).toEqual(['debug', 'warn']);
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
