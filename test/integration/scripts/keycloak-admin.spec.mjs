import http from 'node:http';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  POST_LOGOUT_ATTRIBUTE,
  ensurePublicRedirect,
} from '../../../scripts/lib/keycloak-admin.mjs';

/**
 * `ensurePublicRedirect` over real HTTP (plan 20, B-03).
 *
 * The server answers the three admin calls the way Keycloak 26.2 did when they were measured
 * (D-08): a form-encoded password login on the master realm, the client looked up by `clientId`,
 * and a PUT that replaces it. It keeps the client between calls, so a second run sees what the
 * first one saved — which is what idempotency is about.
 */

const ORIGIN = 'https://name.ngrok-free.dev';

/** @type {http.Server} */
let server;
/** @type {string} */
let baseUrl;

/** What the server holds, and how it answers; reset before each test. */
const state = {
  /** @type {Record<string, unknown>[]} */
  clients: [],
  password: 'admin',
  puts: 0,
};

/**
 * @param {http.IncomingMessage} request
 * @returns {Promise<string>}
 */
async function bodyOf(request) {
  let body = '';
  for await (const chunk of request) {
    body += String(chunk);
  }
  return body;
}

/**
 * @param {http.ServerResponse} response
 * @param {number} status
 * @param {unknown} [body]
 */
function answer(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(body === undefined ? undefined : JSON.stringify(body));
}

const CLIENTS = '/admin/realms/remote-claude/clients';

/**
 * The password login of the master realm.
 *
 * @param {string} body
 * @param {http.ServerResponse} response
 */
function login(body, response) {
  const form = new URLSearchParams(body);
  const valid = form.get('client_id') === 'admin-cli' && form.get('password') === state.password;
  answer(
    response,
    valid ? 200 : 401,
    valid ? { access_token: 'admin-token' } : { error: 'invalid_grant' },
  );
}

/**
 * The admin calls, once the bearer is the one the login gave.
 *
 * @param {string} method
 * @param {URL} url
 * @param {string} body
 * @param {http.ServerResponse} response
 */
function admin(method, url, body, response) {
  if (method === 'GET' && url.pathname === CLIENTS) {
    const clientId = url.searchParams.get('clientId');
    answer(
      response,
      200,
      state.clients.filter((client) => client['clientId'] === clientId),
    );
    return;
  }

  if (method === 'PUT' && url.pathname.startsWith(`${CLIENTS}/`)) {
    const id = url.pathname.slice(CLIENTS.length + 1);
    state.clients = state.clients.map((client) =>
      client['id'] === id ? JSON.parse(body) : client,
    );
    state.puts += 1;
    answer(response, 204);
    return;
  }

  answer(response, 404);
}

/**
 * @param {http.IncomingMessage} request
 * @param {http.ServerResponse} response
 * @returns {Promise<void>}
 */
async function keycloak(request, response) {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const body = await bodyOf(request);

  if (
    request.method === 'POST' &&
    url.pathname === '/realms/master/protocol/openid-connect/token'
  ) {
    login(body, response);
  } else if (request.headers.authorization === 'Bearer admin-token') {
    admin(request.method ?? 'GET', url, body, response);
  } else {
    answer(response, 401);
  }
}

beforeAll(async () => {
  server = http.createServer((request, response) => {
    void keycloak(request, response);
  });
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(undefined));
  });
  const address = /** @type {import('node:net').AddressInfo} */ (server.address());
  baseUrl = `http://127.0.0.1:${String(address.port)}`;
});

afterAll(async () => {
  await new Promise((resolve) => {
    server.close(() => resolve(undefined));
  });
});

beforeEach(() => {
  state.password = 'admin';
  state.puts = 0;
  state.clients = [
    {
      id: 'b66c02d9',
      clientId: 'remote-claude-web',
      redirectUris: ['http://localhost/*'],
      attributes: {
        'pkce.code.challenge.method': 'S256',
        [POST_LOGOUT_ATTRIBUTE]: 'http://localhost/*',
      },
      protocolMappers: [{ name: 'remote-claude-api-audience' }],
    },
  ];
});

/** @param {Partial<{ clientId: string, password: string }>} [overrides] */
const target = (overrides = {}) => ({
  keycloakUrl: baseUrl,
  realm: 'remote-claude',
  clientId: 'remote-claude-web',
  username: 'admin',
  password: 'admin',
  ...overrides,
});

describe('ensurePublicRedirect, over HTTP', () => {
  it('adds the origin once; the second run writes nothing (S-20)', async () => {
    await expect(ensurePublicRedirect(target(), ORIGIN)).resolves.toBe('added');
    await expect(ensurePublicRedirect(target(), ORIGIN)).resolves.toBe('present');

    expect(state.puts).toBe(1);
    expect(state.clients[0]).toMatchObject({
      redirectUris: ['http://localhost/*', `${ORIGIN}/*`],
      attributes: {
        'pkce.code.challenge.method': 'S256',
        [POST_LOGOUT_ATTRIBUTE]: `http://localhost/*##${ORIGIN}/*`,
      },
      protocolMappers: [{ name: 'remote-claude-api-audience' }],
    });
  });

  it('names the admin variables when the provider refuses the login (S-21)', async () => {
    await expect(ensurePublicRedirect(target({ password: 'wrong' }), ORIGIN)).rejects.toThrow(
      /admin login refused — check RC_KEYCLOAK_ADMIN/,
    );
    expect(state.puts).toBe(0);
  });

  it('names the client when the realm does not have it (S-22)', async () => {
    await expect(ensurePublicRedirect(target({ clientId: 'nobody' }), ORIGIN)).rejects.toThrow(
      'client not found: nobody is not in realm remote-claude',
    );
  });
});
