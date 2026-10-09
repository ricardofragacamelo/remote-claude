import type { InstallationAccount } from '@domain/session';

/** Whether the CLI of the machine is signed in — a state of the account, never an error (S-25). */
export type AccountState = 'ready' | 'loginRequired';

/**
 * Reads the login off what the CLI said about the account.
 *
 * A first-party login names an e-mail; an API key or a helper names its source; a cloud provider
 * (Bedrock, Vertex…) or a gateway authenticates outside the CLI and names neither. An account of
 * the first party with no e-mail and no key is a CLI nobody signed in to — and the product does not
 * sign anyone in remotely: the screen says what to run on the machine (backend/04).
 */
export function accountStateOf(account: InstallationAccount): AccountState {
  const firstParty = account.provider === null || account.provider === 'firstParty';
  const keyed = account.apiKeySource !== null && account.apiKeySource !== 'none';

  return firstParty && account.email === null && !keyed && account.tokenSource === null
    ? 'loginRequired'
    : 'ready';
}
