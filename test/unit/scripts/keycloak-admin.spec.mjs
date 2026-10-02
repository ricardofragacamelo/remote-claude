import { describe, expect, it } from 'vitest';

import {
  POST_LOGOUT_ATTRIBUTE,
  ensurePublicRedirect,
  withPublicRedirect,
} from '../../../scripts/lib/keycloak-admin.mjs';

/**
 * The redirect of the public origin on the realm's web client (plan 20, B-03).
 *
 * The admin API itself is driven through a stand-in `fetch` here, because what is checked is which
 * call goes out and what each answer turns into. A real HTTP server answers the same calls in the
 * integration suite.
 */

const ORIGIN = 'https://name.ngrok-free.dev';

/** The web client as the realm file declares it, trimmed to what matters here. */
const client = {
  id: 'b66c02d9',
  clientId: 'remote-claude-web',
  redirectUris: ['http://localhost/*', 'http://127.0.0.1/*'],
  attributes: {
    'pkce.code.challenge.method': 'S256',
    [POST_LOGOUT_ATTRIBUTE]: 'http://localhost/*',
  },
  protocolMappers: [{ name: 'remote-claude-api-audience' }],
};

describe('withPublicRedirect', () => {
  it('adds the origin to both lists and keeps the rest of the client (S-19)', () => {
    expect(withPublicRedirect(client, ORIGIN)).toEqual({
      ...client,
      redirectUris: ['http://localhost/*', 'http://127.0.0.1/*', `${ORIGIN}/*`],
      attributes: {
        'pkce.code.challenge.method': 'S256',
        [POST_LOGOUT_ATTRIBUTE]: `http://localhost/*##${ORIGIN}/*`,
      },
    });
  });

  it('answers null once both lists have it', () => {
    const once = withPublicRedirect(client, ORIGIN);
    expect(once).not.toBeNull();
    expect(withPublicRedirect(/** @type {typeof client} */ (once), ORIGIN)).toBeNull();
  });

  it('completes a client that has only one of the two', () => {
    const half = { ...client, redirectUris: [...client.redirectUris, `${ORIGIN}/*`] };
    expect(withPublicRedirect(half, ORIGIN)?.redirectUris).toEqual(half.redirectUris);
    expect(withPublicRedirect(half, ORIGIN)?.attributes?.[POST_LOGOUT_ATTRIBUTE]).toBe(
      `http://localhost/*##${ORIGIN}/*`,
    );

    const other = { ...client, attributes: { [POST_LOGOUT_ATTRIBUTE]: `${ORIGIN}/*` } };
    expect(withPublicRedirect(other, ORIGIN)?.attributes?.[POST_LOGOUT_ATTRIBUTE]).toBe(
      `${ORIGIN}/*`,
    );
  });

  it.each([
    ['absent', { id: 'x' }],
    ['empty', { id: 'x', attributes: { [POST_LOGOUT_ATTRIBUTE]: '' } }],
  ])('turns %s post-logout redirects into the origin alone (S-23)', (_, bare) => {
    expect(withPublicRedirect(bare, ORIGIN)).toMatchObject({
      redirectUris: [`${ORIGIN}/*`],
      attributes: { [POST_LOGOUT_ATTRIBUTE]: `${ORIGIN}/*` },
    });
  });
});

/**
 * A `fetch` that answers from a script, and records every call.
 *
 * @param {Record<string, () => Response>} routes `METHOD path` → answer
 */
function scriptedFetch(routes) {
  /** @type {{ method: string, path: string, body: unknown }[]} */
  const calls = [];

  /** @type {typeof fetch} */
  const http = (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    calls.push({ method, path: `${url.pathname}${url.search}`, body: init.body });

    const answer = routes[`${method} ${url.pathname}`];
    return Promise.resolve(answer === undefined ? new Response(null, { status: 404 }) : answer());
  };

  return { http, calls };
}

const TOKEN = 'POST /realms/master/protocol/openid-connect/token';
const LIST = 'GET /admin/realms/remote-claude/clients';
const SAVE = `PUT /admin/realms/remote-claude/clients/${client.id}`;

/** @param {typeof fetch} http */
const target = (http) => ({
  keycloakUrl: 'http://localhost:8180',
  realm: 'remote-claude',
  clientId: 'remote-claude-web',
  username: 'admin',
  password: 'admin',
  fetch: http,
});

const granted = () => Response.json({ access_token: 'token' });

describe('ensurePublicRedirect', () => {
  it('logs in, reads the client and saves it with the origin', async () => {
    const { http, calls } = scriptedFetch({
      [TOKEN]: granted,
      [LIST]: () => Response.json([client]),
      [SAVE]: () => new Response(null, { status: 204 }),
    });

    await expect(ensurePublicRedirect(target(http), ORIGIN)).resolves.toBe('added');
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      TOKEN,
      `${LIST}?clientId=remote-claude-web`,
      SAVE,
    ]);
    expect(JSON.parse(String(calls[2]?.body))).toMatchObject({
      redirectUris: ['http://localhost/*', 'http://127.0.0.1/*', `${ORIGIN}/*`],
    });
  });

  it('writes nothing when the client has it already', async () => {
    const present = withPublicRedirect(client, ORIGIN);
    const { http, calls } = scriptedFetch({
      [TOKEN]: granted,
      [LIST]: () => Response.json([present]),
    });

    await expect(ensurePublicRedirect(target(http), ORIGIN)).resolves.toBe('present');
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
  });

  it('names the admin variables when the login is refused', async () => {
    const { http } = scriptedFetch({ [TOKEN]: () => new Response(null, { status: 401 }) });

    await expect(ensurePublicRedirect(target(http), ORIGIN)).rejects.toThrow(
      /admin login refused — check RC_KEYCLOAK_ADMIN and RC_KEYCLOAK_ADMIN_PASSWORD/,
    );
  });

  it('says which call failed for any other status', async () => {
    const down = scriptedFetch({ [TOKEN]: () => new Response(null, { status: 503 }) });
    await expect(ensurePublicRedirect(target(down.http), ORIGIN)).rejects.toThrow(
      'the admin login answered 503',
    );

    const forbidden = scriptedFetch({
      [TOKEN]: granted,
      [LIST]: () => new Response(null, { status: 403 }),
    });
    await expect(ensurePublicRedirect(target(forbidden.http), ORIGIN)).rejects.toThrow(
      'reading the web client answered 403',
    );

    const conflict = scriptedFetch({
      [TOKEN]: granted,
      [LIST]: () => Response.json([client]),
      [SAVE]: () => new Response(null, { status: 409 }),
    });
    await expect(ensurePublicRedirect(target(conflict.http), ORIGIN)).rejects.toThrow(
      'saving the web client answered 409',
    );
  });

  it('refuses a login answer without a token', async () => {
    const { http } = scriptedFetch({ [TOKEN]: () => Response.json({}) });

    await expect(ensurePublicRedirect(target(http), ORIGIN)).rejects.toThrow(
      'the admin login answered without an access token',
    );
  });

  it('names the client when the realm does not have it', async () => {
    const { http } = scriptedFetch({ [TOKEN]: granted, [LIST]: () => Response.json([]) });

    await expect(ensurePublicRedirect(target(http), ORIGIN)).rejects.toThrow(
      'client not found: remote-claude-web is not in realm remote-claude',
    );
  });
});
