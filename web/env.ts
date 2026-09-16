/**
 * The browser's settings, derived from the one `.env` the whole stack shares.
 *
 * The front does not get variables of its own: the port the backend listens on and the OIDC issuer
 * are already declared once, in `.env.example`, and a second copy prefixed with `VITE_` is a second
 * thing to keep in step. What Vite needs is the `VITE_*` names, so they are computed here and
 * injected at build time — by the dev server, the production build and the test runner alike.
 */

/** What `import.meta.env` has to carry for `src/shared/config/env.ts` to accept it. */
export interface BrowserEnvironment {
  readonly VITE_API_URL: string;
  readonly VITE_WS_URL: string;
  readonly VITE_OIDC_ISSUER: string;
  readonly VITE_OIDC_CLIENT_ID: string;
  readonly VITE_OIDC_SCOPES: string;
  readonly VITE_APP_VERSION: string;
}

/** A variable of the shared environment, with the fallback used when it is unset. */
function read(source: Record<string, string | undefined>, name: string, fallback: string): string {
  const value = source[name];
  return value === undefined || value === '' ? fallback : value;
}

/**
 * @param source the process environment, after `.env` has been loaded into it
 * @param version the version to report in every log line
 */
export function browserEnvironment(
  source: Record<string, string | undefined>,
  version: string,
): BrowserEnvironment {
  const backend = `localhost:${read(source, 'RC_BACKEND_PORT', '3000')}`;

  return {
    VITE_API_URL: `http://${backend}`,
    VITE_WS_URL: `ws://${backend}/ws`,
    VITE_OIDC_ISSUER: read(source, 'OIDC_ISSUER', 'http://localhost:8180/realms/remote-claude'),
    VITE_OIDC_CLIENT_ID: read(source, 'OIDC_CLIENT_ID_WEB', 'remote-claude-web'),
    VITE_OIDC_SCOPES: read(source, 'OIDC_SCOPES', 'openid profile email offline_access'),
    VITE_APP_VERSION: version,
  };
}

/** The same values as `define` entries, which is the shape Vite and Vitest both take. */
export function browserDefine(environment: BrowserEnvironment): Record<string, string> {
  return Object.fromEntries(
    Object.entries(environment).map(([name, value]) => [
      `import.meta.env.${name}`,
      JSON.stringify(value),
    ]),
  );
}
