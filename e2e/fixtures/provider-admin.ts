import { environment } from './environment';

/**
 * What the suite's own provider is told to do, for the two scenarios no door of the product
 * reaches.
 *
 * The provider is the Keycloak of `infra/keycloak`, brought up by the run and gone after it — never
 * a real one, so an administrator's password here is a password of a throwaway container. Two
 * things are asked of it, and each is undone by the test that asked:
 *
 * - **a shorter token for one client** (S-44): an access token that lives seconds instead of a
 *   quarter of an hour, so its expiry falls inside a turn the test can hold open;
 * - **the end of a user's sessions** (S-79): what an administrator does to cut somebody off, and
 *   what makes the next renewal of the browser be refused.
 *
 * Nothing else in the suite talks to the provider's administration: the product never does, and a
 * suite that set its world up through the side door would stop proving the front one.
 */

/** The realm of the suite, as `infra/keycloak/realm-remote-claude.json` names it. */
const REALM = 'remote-claude';

/** A client of the realm, as the administration lists it. */
interface ClientRepresentation {
  readonly id: string;
  readonly clientId: string;
  readonly attributes?: Readonly<Record<string, string>>;
}

/** An administrator's token, from the master realm. */
async function adminToken(): Promise<string> {
  const response = await fetch(
    `${environment.keycloakUrl}/realms/master/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username: environment.providerAdmin.username,
        password: environment.providerAdmin.password,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`the provider refused its administrator with ${String(response.status)}`);
  }

  return ((await response.json()) as { access_token: string }).access_token;
}

/** Calls the realm's administration, and fails loudly on anything but success. */
async function administer(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${environment.keycloakUrl}/admin/realms/${REALM}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${await adminToken()}`,
      'content-type': 'application/json',
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(
      `the provider's administration answered ${String(response.status)} to ${path}: ${await response.text()}`,
    );
  }

  return response;
}

/** The client of the realm called `clientId` — the web's or the app's. */
async function clientNamed(clientId: string): Promise<ClientRepresentation> {
  const response = await administer(`/clients?clientId=${encodeURIComponent(clientId)}`);
  const [client] = (await response.json()) as ClientRepresentation[];

  if (client === undefined) {
    throw new Error(`the realm has no client ${clientId}`);
  }

  return client;
}

/** The attribute that overrides the realm's access token lifespan for one client, in seconds. */
const LIFESPAN = 'access.token.lifespan';

/**
 * Makes the access tokens of one client live `seconds`, and answers what puts it back.
 *
 * The undo restores the attribute **as it was** — absent, most likely, which leaves the realm's
 * own lifespan in charge — rather than writing the realm's number over it.
 *
 * @returns the undo, to be awaited in a `finally`
 */
export async function shortenTokens(
  clientId: string,
  seconds: number,
): Promise<() => Promise<void>> {
  const client = await clientNamed(clientId);
  const before = client.attributes?.[LIFESPAN];

  const write = async (value: string): Promise<void> => {
    await administer(`/clients/${client.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...client, attributes: { ...client.attributes, [LIFESPAN]: value } }),
    });
  };

  await write(String(seconds));

  // An empty value is how the administration clears an override: the attribute stays, and the
  // realm's lifespan applies again.
  return () => write(before ?? '');
}

/**
 * Ends every session `username` has at the provider, the way an administrator cuts somebody off —
 * the offline ones included.
 *
 * The clients ask for `offline_access`, and an offline refresh token outlives the user's sessions:
 * only revoking the grant of each client ends it. Their refresh tokens die with all of it, so the
 * next renewal is refused — which is the point.
 */
export async function endProviderSessions(username: string): Promise<void> {
  const response = await administer(`/users?username=${encodeURIComponent(username)}&exact=true`);
  const [user] = (await response.json()) as { id: string }[];

  if (user === undefined) {
    throw new Error(`the realm has no user ${username}`);
  }

  await administer(`/users/${user.id}/logout`, { method: 'POST' });

  const consents = (await (await administer(`/users/${user.id}/consents`)).json()) as {
    clientId: string;
  }[];
  for (const { clientId } of consents) {
    await administer(`/users/${user.id}/consents/${encodeURIComponent(clientId)}`, {
      method: 'DELETE',
    });
  }
}
