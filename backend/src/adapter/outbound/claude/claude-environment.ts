/**
 * The namespaces that belong to this backend's own configuration.
 *
 * A prefix and not a list of names, because the list is what goes stale: a variable added to the
 * configuration tomorrow has to leave the subprocess without anybody remembering to add it here.
 * The test holds this against every key of the configuration schema and of `.env.example`, so a
 * key that escapes the prefixes fails a gate instead of reaching Claude.
 */
const BACKEND_PREFIXES = ['RC_', 'OIDC_', 'DATABASE_', 'PG'] as const;

/** The configuration keys whose names are too generic for a prefix, and are still ours. */
const BACKEND_NAMES: ReadonlySet<string> = new Set(['NODE_ENV', 'LOG_LEVEL']);

/**
 * Whether a variable is part of the backend's configuration rather than of the user's machine.
 *
 * `CLAUDE_CONFIG_DIR` is declared in `.env.example` and is still **not** ours to withhold: it is
 * where the CLI finds its login, and the subprocess without it is a Claude that is not signed in.
 */
export function isBackendVariable(name: string): boolean {
  return BACKEND_NAMES.has(name) || BACKEND_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/**
 * The environment a Claude subprocess is started with: the machine's, without the backend's.
 *
 * `pnpm dev` loads the whole `.env` into the backend's process, so handing the CLI `process.env`
 * as it is gives every `Bash` Claude runs the database password and the identity provider's admin
 * password — an `env` away, and one `Bash(*)` rule away from nobody being asked
 * ([10 · D-10](../../../../../docs/plans/10-integrated-terminal/decisions.md)).
 *
 * A deny list and not an allow list, on purpose: the CLI needs whatever the user's machine gives
 * it — `PATH`, `HOME`, proxy, CA bundle, `ANTHROPIC_*`, the cloud provider's credentials — and,
 * unlike a login shell, it never reads a profile to get them back.
 */
export function claudeEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(environment).filter(([name]) => !isBackendVariable(name)),
  );
}
