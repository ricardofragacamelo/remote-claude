/**
 * The namespaces that belong to this backend's own configuration.
 *
 * A prefix and not a list of names, because the list is what goes stale: a variable added to the
 * configuration tomorrow has to leave a subprocess without anybody remembering to add it here. The
 * test holds this against every key of the configuration schema and of `.env.example`, so a key
 * that escapes the prefixes fails a gate instead of reaching a subprocess.
 */
const BACKEND_PREFIXES = ['RC_', 'OIDC_', 'DATABASE_', 'PG'] as const;

/** The configuration keys whose names are too generic for a prefix, and are still ours. */
const BACKEND_NAMES: ReadonlySet<string> = new Set(['NODE_ENV', 'LOG_LEVEL']);

/**
 * Whether a variable is part of the backend's configuration rather than of the user's machine.
 *
 * An engine's own login-location variable is declared in `.env.example` and is still **not** ours
 * to withhold: it never matches one of these prefixes to begin with, and a subprocess without it is
 * an agent that cannot find where it is signed in. Neutral on purpose — this module names no
 * engine, because every engine's subprocess (and, per plan 12, the integrated terminal's shell)
 * needs the same filtering.
 */
export function isBackendVariable(name: string): boolean {
  return BACKEND_NAMES.has(name) || BACKEND_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/**
 * The environment a subprocess of this backend is started with: the machine's, without the
 * backend's own (plan 13, B-20; plan 12, D-10).
 *
 * `pnpm dev` loads the whole `.env` into the backend's process, so handing a subprocess
 * `process.env` as it is gives every shell command it runs the database password and the identity
 * provider's admin password — an `env` away, and one `Bash(*)` rule away from nobody being asked.
 *
 * A deny list and not an allow list, on purpose: a subprocess needs whatever the user's machine
 * gives it — `PATH`, `HOME`, proxy, CA bundle, cloud provider credentials — and, unlike a login
 * shell, it never reads a profile to get them back.
 *
 * The first of its two callers to need it creates it here, in `shared/`, so the second reuses it
 * rather than writing a second, maybe-divergent filter: the engine adapters build the environment
 * of an agent's own subprocess, and an MCP server's stdio subprocess (plan 13, B-21) inherits from
 * it; the integrated terminal (plan 12) builds the environment of the shell it opens.
 */
export function hostEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(environment).filter(([name]) => !isBackendVariable(name)),
  );
}
