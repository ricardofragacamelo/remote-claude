/**
 * The redirect of the public origin, on the web client of the local realm.
 *
 * The public domain is personal, so it cannot live in the versioned realm file, and
 * `--import-realm` skips a realm that already exists anyway. It is added through the admin API on
 * every public run instead, and only when missing (docs/plans/20-dev-public/decisions.md, D-03).
 * It is never removed: a redirect that only leads back to one's own domain is not worth a second
 * code path.
 *
 * The admin API is called on `localhost`, never through the tunnel: the console is not forwarded
 * (D-06), and its credentials are the development ones.
 */

/** The attribute Keycloak keeps the post-logout redirects in, `##`-separated. */
export const POST_LOGOUT_ATTRIBUTE = 'post.logout.redirect.uris';

/**
 * @typedef {{ id: string, redirectUris?: string[], attributes?: Record<string, string> }
 *   & Record<string, unknown>} ClientRepresentation
 */

/**
 * The client with `<origin>/*` among its redirects, or `null` when it already is.
 *
 * Everything else in the representation is carried over untouched: the PUT replaces the client,
 * and a field dropped here would be a setting lost there (PKCE, the audience mapper).
 *
 * @param {ClientRepresentation} client
 * @param {string} origin
 * @returns {ClientRepresentation | null}
 */
export function withPublicRedirect(client, origin) {
  const pattern = `${origin}/*`;
  const redirects = client.redirectUris ?? [];
  const attributes = client.attributes ?? {};
  const postLogout = (attributes[POST_LOGOUT_ATTRIBUTE] ?? '')
    .split('##')
    .filter((uri) => uri !== '');

  if (redirects.includes(pattern) && postLogout.includes(pattern)) {
    return null;
  }

  return {
    ...client,
    redirectUris: redirects.includes(pattern) ? redirects : [...redirects, pattern],
    attributes: {
      ...attributes,
      [POST_LOGOUT_ATTRIBUTE]: (postLogout.includes(pattern)
        ? postLogout
        : [...postLogout, pattern]
      ).join('##'),
    },
  };
}

/**
 * @typedef {object} AdminTarget
 * @property {string} keycloakUrl base URL on this machine, e.g. `http://localhost:8180`
 * @property {string} realm
 * @property {string} clientId
 * @property {string} username
 * @property {string} password
 * @property {typeof fetch} [fetch] injected for the suite
 */

/**
 * Makes sure the web client accepts the public origin as a redirect.
 *
 * @param {AdminTarget} target
 * @param {string} origin
 * @returns {Promise<'added' | 'present'>}
 * @throws {Error} naming what to check: the admin credentials, or the client
 */
export async function ensurePublicRedirect(target, origin) {
  const http = target.fetch ?? fetch;
  const token = await adminToken(http, target);
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const clients = `${target.keycloakUrl}/admin/realms/${target.realm}/clients`;

  const found = await http(`${clients}?clientId=${encodeURIComponent(target.clientId)}`, {
    headers,
  });
  expectOk(found, 'reading the web client');

  const [client] = /** @type {ClientRepresentation[]} */ (await found.json());
  if (client === undefined) {
    throw new Error(`client not found: ${target.clientId} is not in realm ${target.realm}`);
  }

  const updated = withPublicRedirect(client, origin);
  if (updated === null) {
    return 'present';
  }

  const saved = await http(`${clients}/${client.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(updated),
  });
  expectOk(saved, 'saving the web client');
  return 'added';
}

/**
 * @param {typeof fetch} http
 * @param {AdminTarget} target
 * @returns {Promise<string>}
 */
async function adminToken(http, target) {
  const response = await http(`${target.keycloakUrl}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: target.username,
      password: target.password,
    }),
  });

  if (response.status === 401) {
    throw new Error(
      'admin login refused — check RC_KEYCLOAK_ADMIN and RC_KEYCLOAK_ADMIN_PASSWORD in .env',
    );
  }
  expectOk(response, 'the admin login');

  const body = /** @type {{ access_token?: unknown }} */ (await response.json());
  if (typeof body.access_token !== 'string') {
    throw new Error('the admin login answered without an access token');
  }

  return body.access_token;
}

/**
 * @param {Response} response
 * @param {string} what
 */
function expectOk(response, what) {
  if (!response.ok) {
    throw new Error(`${what} answered ${String(response.status)}`);
  }
}
