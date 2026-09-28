import http from 'node:http';
import type { AddressInfo } from 'node:net';

import type { JWK } from 'jose';

import { FakeIdentityProvider } from './fake-oidc';
import type { TokenOverrides } from './fake-oidc';

/** What the token endpoint should answer next. */
export interface TokenAnswer {
  readonly status: number;
  readonly body: unknown;
}

/** How many times each endpoint of the provider was asked for something. */
export interface EndpointHits {
  discovery: number;
  certs: number;
  token: number;
}

/** The fake provider, reachable over HTTP so the adapters exercise their own `fetch`. */
export interface IdentityServer {
  readonly issuer: string;
  readonly provider: FakeIdentityProvider;

  /** Queues what the token endpoint answers next. Answers are consumed in order. */
  answerToken(answer: TokenAnswer): void;

  /** Bodies posted to the token endpoint, in order. */
  readonly tokenRequests: string[];

  /** Requests per endpoint, since the server started or since the last {@link resetHits}. */
  readonly hits: EndpointHits;
  resetHits(): void;

  /**
   * Publishes one more signing key, the way a provider rotates: without telling anybody. Tokens
   * that provider signs are then valid here, once the backend has reread the key set.
   */
  publish(provider: FakeIdentityProvider): void;

  /**
   * Starts a family of refresh tokens and answers its first member.
   *
   * From then on, the token endpoint treats a member of the family the way a provider with
   * rotation and reuse detection does: the **current** member rotates — a new access token, a new
   * refresh token, the old one superseded — and a **superseded** member is a leak, which revokes the
   * whole family. After that, every member is refused, the newest one included.
   */
  startFamily(subject?: string): string;

  /** A token this server would have issued: signed by its key, for its own issuer. */
  accessToken(overrides?: TokenOverrides): Promise<string>;

  stop(): Promise<void>;
}

/** One login's chain of refresh tokens. */
interface Family {
  readonly subject: string;
  current: string;
  revoked: boolean;
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
  const hits: EndpointHits = { discovery: 0, certs: 0, token: 0 };
  const published: JWK[] = [...provider.jwks().keys];
  const families = new Map<string, Family>();
  let issued = 0;
  let issuer = '';

  const rotate = async (family: Family): Promise<TokenAnswer> => {
    issued += 1;
    family.current = `rt-${String(issued)}`;
    families.set(family.current, family);

    return {
      status: 200,
      body: {
        access_token: await provider.accessToken({ issuer, subject: family.subject }),
        refresh_token: family.current,
        expires_in: 900,
      },
    };
  };

  const answerFamily = async (family: Family, presented: string): Promise<TokenAnswer> => {
    if (!family.revoked && presented === family.current) {
      return rotate(family);
    }

    // A superseded member presented again: somebody else holds a copy. The family goes.
    family.revoked = true;
    return { status: 400, body: { error: 'invalid_grant' } };
  };

  const answerFor = async (body: string): Promise<TokenAnswer> => {
    const presented = new URLSearchParams(body).get('refresh_token');
    const family = presented === null ? undefined : families.get(presented);

    if (family !== undefined && presented !== null) {
      return answerFamily(family, presented);
    }

    // Strict FIFO: a test queues exactly what it expects to be consumed, and an unqueued call is
    // a refusal rather than a stale success from an earlier test.
    return answers.shift() ?? { status: 400, body: { error: 'nothing_queued' } };
  };

  const server = http.createServer((request, response) => {
    const url = request.url ?? '';

    if (url.endsWith('/.well-known/openid-configuration')) {
      hits.discovery += 1;
      respond(response, 200, provider.discoveryDocument(issuer));
      return;
    }

    if (url.endsWith('/certs')) {
      hits.certs += 1;
      respond(response, 200, { keys: published });
      return;
    }

    if (url.endsWith('/token')) {
      hits.token += 1;
      collect(request, (body) => {
        tokenRequests.push(body);
        void answerFor(body).then((answer) => respond(response, answer.status, answer.body));
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
    hits,
    resetHits: () => {
      hits.discovery = 0;
      hits.certs = 0;
      hits.token = 0;
    },
    publish: (next) => published.push(...next.jwks().keys),
    startFamily: (subject = 'auth|42') => {
      issued += 1;
      const family: Family = { subject, current: `rt-${String(issued)}`, revoked: false };
      families.set(family.current, family);
      return family.current;
    },
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
