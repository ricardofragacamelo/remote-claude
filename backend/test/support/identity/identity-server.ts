import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { FakeIdentityProvider } from './fake-oidc';
import type { TokenOverrides } from './fake-oidc';

/** What the token endpoint should answer next. */
export interface TokenAnswer {
  readonly status: number;
  readonly body: unknown;
}

/** The fake provider, reachable over HTTP so the adapters exercise their own `fetch`. */
export interface IdentityServer {
  readonly issuer: string;
  readonly provider: FakeIdentityProvider;

  /** Queues what the token endpoint answers next. Answers are consumed in order. */
  answerToken(answer: TokenAnswer): void;

  /** Bodies posted to the token endpoint, in order. */
  readonly tokenRequests: string[];

  /** A token this server would have issued: signed by its key, for its own issuer. */
  accessToken(overrides?: TokenOverrides): Promise<string>;

  stop(): Promise<void>;
}

/**
 * An OpenID provider on localhost.
 *
 * The integration suite talks to this, never to a real tenant: a test that depends on an external
 * provider is flaky by construction, and it welds the pipeline to a vendor.
 */
export async function startIdentityServer(): Promise<IdentityServer> {
  const provider = await FakeIdentityProvider.create();
  const answers: TokenAnswer[] = [];
  const tokenRequests: string[] = [];
  let issuer = '';

  const server = http.createServer((request, response) => {
    const url = request.url ?? '';

    if (url.endsWith('/.well-known/openid-configuration')) {
      respond(response, 200, provider.discoveryDocument(issuer));
      return;
    }

    if (url.endsWith('/certs')) {
      respond(response, 200, provider.jwks());
      return;
    }

    if (url.endsWith('/token')) {
      collect(request, (body) => {
        tokenRequests.push(body);
        // Strict FIFO: a test queues exactly what it expects to be consumed, and an unqueued
        // call is a refusal rather than a stale success from an earlier test.
        const next = answers.shift();
        respond(response, next?.status ?? 400, next?.body ?? { error: 'nothing_queued' });
      });
      return;
    }

    respond(response, 404, { error: 'not_found' });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  issuer = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/realms/remote-claude`;

  return {
    issuer,
    provider,
    tokenRequests,
    answerToken: (answer) => answers.push(answer),
    accessToken: (overrides = {}) => provider.accessToken({ issuer, ...overrides }),
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function respond(response: http.ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

function collect(request: http.IncomingMessage, done: (body: string) => void): void {
  const chunks: Buffer[] = [];
  request.on('data', (chunk: Buffer) => chunks.push(chunk));
  request.on('end', () => done(Buffer.concat(chunks).toString('utf8')));
}
