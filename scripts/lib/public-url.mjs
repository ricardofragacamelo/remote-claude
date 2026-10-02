/**
 * The public origin `pnpm dev:public` serves the stack at, and the environment it produces.
 *
 * Everything goes through one origin (docs/plans/20-dev-public/decisions.md, D-01): the web dev
 * server answers it and forwards the API, the WebSocket and the identity provider. What changes
 * for the rest of the stack is therefore two variables — the origin itself, which the web build
 * reads, and the issuer, which has to be the public one on both sides of a token: the provider
 * that signs it and the backend that compares `iss` against `OIDC_ISSUER`.
 */

/** The variable that carries the public origin, read only under `--public` (D-02). */
export const PUBLIC_URL_VARIABLE = 'RC_PUBLIC_URL';

/**
 * The compose files of a run: compose's own default locally, the public override on top of the
 * base file otherwise (D-08).
 *
 * @param {boolean} isPublic
 * @returns {string[]}
 */
export function composeFiles(isPublic) {
  return isPublic ? ['docker-compose.yml', 'docker-compose.public.yml'] : [];
}

/**
 * @typedef {{ ok: true, origin: string, host: string }
 *   | { ok: false, reason: 'unreadable' | 'not-https' | 'not-an-origin' }} PublicOrigin
 */

/**
 * Reads a public origin: `https://host`, or a bare `host` that gets the scheme.
 *
 * Only HTTPS: off the loopback the stack is never reachable in clear text (plan 19, B-08), and the
 * tunnel terminates TLS on 443 — so a port, like a path, means the value is not the origin the
 * tunnel publishes.
 *
 * @param {string} value
 * @returns {PublicOrigin}
 */
export function parsePublicOrigin(value) {
  const trimmed = value.trim();
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  /** @type {URL} */
  let url;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, reason: 'unreadable' };
  }

  if (trimmed === '' || url.hostname === '') {
    return { ok: false, reason: 'unreadable' };
  }

  if (url.protocol !== 'https:') {
    return { ok: false, reason: 'not-https' };
  }

  const extras = [url.port, url.search, url.hash, url.username, url.password];
  if (url.pathname !== '/' || extras.some((part) => part !== '')) {
    return { ok: false, reason: 'not-an-origin' };
  }

  return { ok: true, origin: url.origin, host: url.host };
}

/** What each refusal of `parsePublicOrigin` means, for the line the operator reads. */
export const ORIGIN_REFUSALS = {
  unreadable: 'is not a URL or a host name',
  'not-https': 'must be https:// — the stack is never public in clear text',
  'not-an-origin': 'must be an origin only — no path, query, fragment, port or credentials',
};

/**
 * The issuer as seen from the public origin: the same realm path, on the public host.
 *
 * @param {string} origin as returned by `parsePublicOrigin`
 * @param {string} localIssuer the `OIDC_ISSUER` of the local stack
 * @returns {string}
 */
export function publicIssuer(origin, localIssuer) {
  return `${origin}${new URL(localIssuer).pathname.replace(/\/$/, '')}`;
}

/**
 * The environment of a public run: the origin, and the issuer the provider now signs with.
 *
 * Pure, and stable under repetition — applying it to its own output changes nothing, because the
 * issuer path is kept and only the origin moves.
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {string} origin
 * @returns {NodeJS.ProcessEnv}
 */
export function publicEnvironment(env, origin) {
  const issuer = env['OIDC_ISSUER'];
  if (issuer === undefined || issuer === '') {
    throw new Error('OIDC_ISSUER is not set — copy it from .env.example');
  }

  return { ...env, [PUBLIC_URL_VARIABLE]: origin, OIDC_ISSUER: publicIssuer(origin, issuer) };
}

/**
 * The environment of a local run: no public origin, whatever `.env` says.
 *
 * An `RC_PUBLIC_URL` left in `.env` from a public run would otherwise give the web build public
 * URLs with no tunnel behind them (D-02). Empty, not deleted: the web config loads `.env` on its
 * own, and `process.loadEnvFile` only fills variables that are not set at all.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {NodeJS.ProcessEnv}
 */
export function localEnvironment(env) {
  return { ...env, [PUBLIC_URL_VARIABLE]: '' };
}

/**
 * Reads `--public` and `--url <origin>` from the arguments of `start-local`.
 *
 * @param {readonly string[]} argv the arguments after the script name
 * @returns {{ ok: true, public: boolean, url: string | null } | { ok: false, message: string }}
 */
export function parseStartArgs(argv) {
  let isPublic = false;
  /** @type {string | null} */
  let url = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--public') {
      isPublic = true;
    } else if (arg === '--url' && argv[index + 1] !== undefined) {
      url = argv[index + 1] ?? null;
      index += 1;
    } else {
      return { ok: false, message: `unknown argument: ${String(arg)}` };
    }
  }

  if (url !== null && !isPublic) {
    return { ok: false, message: '--url only makes sense with --public' };
  }

  return { ok: true, public: isPublic, url };
}
