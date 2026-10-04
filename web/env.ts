/**
 * The browser's settings, derived from the one `.env` the whole stack shares.
 *
 * The front does not get variables of its own: the port the backend listens on and the OIDC issuer
 * are already declared once, in `.env.example`, and a second copy prefixed with `VITE_` is a second
 * thing to keep in step. What Vite needs is the `VITE_*` names, so they are computed here and
 * injected at build time — by the dev server, the production build and the test runner alike.
 */

import type { ProxyOptions, ServerOptions } from 'vite';

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
  const origin = publicOrigin(source);

  return {
    VITE_API_URL: origin === null ? `http://${backend}` : `${origin.origin}${API_PREFIX}`,
    VITE_WS_URL: origin === null ? `ws://${backend}/ws` : `wss://${origin.host}/ws`,
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

/**
 * Where the dev server forwards the API to: one origin for everything
 * (docs/plans/20-dev-public/decisions.md, D-01). The backend has no global prefix, so the
 * forwarder strips this one.
 */
export const API_PREFIX = '/api';

/** The path the backend's refresh cookie is scoped to, and the one the browser sees it under. */
const REFRESH_COOKIE_PATH = '/auth';

/**
 * The public origin `pnpm dev:public` serves the stack at, or `null` when it is not public.
 *
 * `start-local` validated it already, and blanks it outside public mode — an empty value is the
 * local stack.
 */
function publicOrigin(source: Record<string, string | undefined>): URL | null {
  const value = source['RC_PUBLIC_URL']?.trim();
  return value === undefined || value === '' ? null : new URL(value);
}

/**
 * The paths the web server forwards, so that its origin alone serves the whole stack: the API
 * (without the prefix, and with the refresh cookie's path moved under it, or the browser would
 * never send it back), the WebSocket, and the identity provider's realm and theme files. The admin
 * console is **not** forwarded (docs/plans/20-dev-public/decisions.md, D-06).
 *
 * In public mode the tunnel reaches the stack through it (D-01); in local mode too, since plan 10
 * (D-16): the phone reaches `localhost:<web port>` through `adb reverse`, and that one origin is its
 * API, its WebSocket and its login. The preview server of the end-to-end run inherits it.
 *
 * `changeOrigin` stays off: the identity provider writes the origin it was called through into
 * `iss` (plan 10, B-25), and keeping the request as the client sent it — `Host`, and the
 * `X-Forwarded-*` a tunnel set (D-08) — is what makes that origin the right one.
 */
function forwarding(source: Record<string, string | undefined>): Record<string, ProxyOptions> {
  const backend = `http://localhost:${read(source, 'RC_BACKEND_PORT', '3000')}`;
  const keycloak = `http://localhost:${read(source, 'RC_KEYCLOAK_PORT', '8180')}`;

  return {
    [`^${API_PREFIX}(/|\\?|$)`]: {
      target: backend,
      rewrite: (path) => path.slice(API_PREFIX.length) || '/',
      cookiePathRewrite: { [REFRESH_COOKIE_PATH]: `${API_PREFIX}${REFRESH_COOKIE_PATH}` },
    },
    '^/ws(\\?|$)': { target: backend, ws: true },
    '^/realms/': { target: keycloak },
    '^/resources/': { target: keycloak },
  };
}

/**
 * The dev server: the port and the forwarding; behind the public origin, also what lets the
 * tunnel's host in.
 *
 * - `host`: locally, every interface, as the backend and the identity provider already listen —
 *   the app `pnpm mobile:install` puts on a phone reaches this origin by the machine's address on
 *   the local network (plan 10, D-23). Behind the tunnel, the loopback the tunnel connects to.
 * - `allowedHosts`: Vite refuses a `Host` it does not know, and the tunnel sends the public one.
 *   Locally Vite's own default lets in `localhost` and any IP address, the local network's too.
 * - `hmr`: the page is on HTTPS through the tunnel's 443, not on the dev server's own port.
 */
export function devServer(
  source: Record<string, string | undefined>,
): ServerOptions & { port: number } {
  const port = Number(read(source, 'RC_WEB_PORT', '5173'));
  const origin = publicOrigin(source);
  const proxy = forwarding(source);

  if (origin === null) {
    return { port, strictPort: true, host: true, proxy };
  }

  return {
    port,
    strictPort: true,
    allowedHosts: [origin.hostname],
    hmr: { protocol: 'wss', clientPort: 443 },
    proxy,
  };
}
