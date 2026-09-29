import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

/**
 * Where the stack of *this* run is.
 *
 * `scripts/run-e2e-local.mjs` allocates random ports and writes them into `e2e/.env`; this is the
 * only place the suite learns about them. Nothing here has a default: a suite that falls back to
 * port 3000 when the file is missing silently tests whatever happens to be running on the machine,
 * which is how a green run stops meaning anything.
 */

/** One address of the running stack. */
export interface E2eEnvironment {
  /** Origin of the web front, built and served. */
  readonly webUrl: string;
  /** Origin of the backend's HTTP API. */
  readonly backendUrl: string;
  /** URL of the WebSocket gateway, `/ws` included. */
  readonly wsUrl: string;
  /** Origin of the Keycloak container. */
  readonly keycloakUrl: string;
  /** Issuer of the realm the suite signs in against. */
  readonly issuer: string;
  /** Public client the web front authenticates with. */
  readonly clientId: string;

  /**
   * Where the backend of this run reads the CLI's configuration.
   *
   * Isolated from the developer's own: the backend clears a directory's trust mark before it
   * opens a session there, and a run that did that to somebody's real `~/.claude.json` would be
   * a test editing their editor.
   */
  readonly claudeConfigDir: string;

  /**
   * The backend's own log of this run.
   *
   * Read by `smoke-live/` and by nothing else, for one line: the warning the mapper writes when
   * the SDK sends a message variant this build has never seen. A contract break that only shows
   * up as a log line nobody reads is a contract break that reaches production quietly.
   */
  readonly backendLog: string;

  /**
   * The database of this run.
   *
   * Read by the retention and the trail-isolation specs alone, and only where no door of the
   * product answers. No door writes a row ninety days old — every writer stamps the present — so
   * they plant them here, and remove them through `pnpm db purge`, which is the door they test; and
   * no screen lists the account trail, so the isolation spec counts a revocation here.
   */
  readonly databaseUrl: string;

  /**
   * The administrator of the suite's own provider — the Keycloak of `infra/keycloak`, never a
   * real one.
   *
   * Read by two limits scenarios alone, for what no door of the product can do: shorten a client's
   * token lifetime for the length of one test (S-44), and end a user's sessions at the provider
   * (S-79). Pinned by the runner, so it never depends on whose `.env` is on the machine.
   */
  readonly providerAdmin: { readonly username: string; readonly password: string };

  /**
   * The limits stack, beside the main one: its own backend and web, with a ceiling of two, a TTL of
   * seconds and the product's own rate (`LIMITS_STACK` in `scripts/lib/stack.mjs`).
   *
   * `null` in a run that has none — the live one. A limits spec reads it through
   * {@link limitsStack}, which refuses instead of guessing.
   */
  readonly limits: LimitsStack | null;
}

/** Where the limits stack of this run is. */
export interface LimitsStack {
  readonly webUrl: string;
  readonly backendUrl: string;
  readonly wsUrl: string;
}

/** The addresses every run writes, and the variable each one comes from. */
type Address = Exclude<keyof E2eEnvironment, 'providerAdmin' | 'limits'>;

const VARIABLES: Record<Address, string> = {
  webUrl: 'RC_WEB_URL',
  backendUrl: 'RC_BACKEND_URL',
  wsUrl: 'RC_WS_URL',
  keycloakUrl: 'RC_KEYCLOAK_URL',
  issuer: 'RC_OIDC_ISSUER',
  clientId: 'RC_OIDC_CLIENT_ID',
  claudeConfigDir: 'RC_CLAUDE_CONFIG_DIR',
  backendLog: 'RC_BACKEND_LOG',
  databaseUrl: 'RC_DATABASE_URL',
};

/** The provider's administrator, which every run writes too. */
const PROVIDER_ADMIN = {
  username: 'RC_KEYCLOAK_ADMIN',
  password: 'RC_KEYCLOAK_ADMIN_PASSWORD',
} as const;

/** The limits stack, which only a run that has one writes. */
const LIMITS: Record<keyof LimitsStack, string> = {
  webUrl: 'RC_LIMITS_WEB_URL',
  backendUrl: 'RC_LIMITS_BACKEND_URL',
  wsUrl: 'RC_LIMITS_WS_URL',
};

/** Loads `e2e/.env` into `process.env`, if the file is there. */
export function loadE2eDotEnv(dir: string = import.meta.dirname): boolean {
  const file = path.join(dir, '..', '.env');

  if (!fs.existsSync(file)) {
    return false;
  }

  process.loadEnvFile(file);
  return true;
}

/** Reads a group of variables, noting which of them are missing. */
function readGroup<K extends string>(
  source: NodeJS.ProcessEnv,
  variables: Record<K, string>,
  missing: string[],
): Record<K, string> {
  const values = {} as Record<K, string>;

  for (const [key, variable] of Object.entries(variables) as [K, string][]) {
    const value = source[variable]?.trim() ?? '';

    if (value === '') {
      missing.push(variable);
    }

    values[key] = value;
  }

  return values;
}

/**
 * Reads the addresses, refusing to guess.
 *
 * The limits stack is the one part a run may leave out — the live run has none — and it is all or
 * nothing: half of its addresses would be a stack nobody can reach.
 *
 * @param source the process environment, after `e2e/.env` has been loaded into it
 * @throws {Error} naming every missing variable at once, and the command that writes them
 */
export function readEnvironment(source: NodeJS.ProcessEnv = process.env): E2eEnvironment {
  const missing: string[] = [];
  const addresses = readGroup(source, VARIABLES, missing);
  const providerAdmin = readGroup(source, PROVIDER_ADMIN, missing);

  const absent: string[] = [];
  const limits = readGroup(source, LIMITS, absent);
  if (absent.length > 0 && absent.length < Object.keys(LIMITS).length) {
    missing.push(...absent);
  }

  if (missing.length > 0) {
    throw new Error(
      `the end-to-end suite has no stack to talk to: ${missing.join(', ')} is not set.\n` +
        'Run `pnpm test:e2e`, which brings an ephemeral stack up and writes e2e/.env.',
    );
  }

  return { ...addresses, providerAdmin, limits: absent.length === 0 ? limits : null };
}

/** The addresses of the stack this process is testing. */
export const environment: E2eEnvironment = (() => {
  loadE2eDotEnv();
  return readEnvironment();
})();

/**
 * The limits stack of this run.
 *
 * @throws {Error} when the run has none, which only the live run should be
 */
export function limitsStack(): LimitsStack {
  if (environment.limits === null) {
    throw new Error(
      'this run has no limits stack: `pnpm test:e2e` starts one, and `--live` deliberately does not',
    );
  }

  return environment.limits;
}
