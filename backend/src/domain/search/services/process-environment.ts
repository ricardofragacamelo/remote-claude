/**
 * The whole of the environment any ripgrep subprocess may see — ADR-016.
 *
 * Never the backend's own `env`: no `RC_*` variable, no database password, no OIDC or push
 * credential ever reaches the child (S-07). `PATH` is here only so the OS can resolve a shebang
 * interpreter when the configured binary needs one (B-07's own `--version` probe, and a script
 * stood in for the real binary in a test); it is never used to look the binary itself up.
 */
export const ALLOWED_PROCESS_ENV_KEYS = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR'] as const;

/**
 * Filters [source] down to {@link ALLOWED_PROCESS_ENV_KEYS}, dropping everything else — including
 * `RIPGREP_CONFIG_PATH`, which must never steer what the search engine does (S-22).
 */
export function allowedProcessEnv(
  source: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ALLOWED_PROCESS_ENV_KEYS) {
    const value = source[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }
  return env;
}
