import { z } from 'zod';

import { parseEnvironment } from '@remote-claude/config';

/**
 * The browser's configuration, validated at boot.
 *
 * Nothing here is secret: everything that reaches the bundle is public, and an OIDC `client_id` is
 * public by definition — a single-page application has no client secret. What matters is that a
 * missing value stops the app from starting rather than surfacing as a blank screen in production.
 */
const schema = z.object({
  VITE_API_URL: z.url(),
  VITE_WS_URL: z.string().startsWith('ws'),
  VITE_OIDC_ISSUER: z.url(),
  VITE_OIDC_CLIENT_ID: z.string().min(1),
  VITE_OIDC_SCOPES: z.string().min(1),
  VITE_APP_VERSION: z.string().min(1),
});

/** The configuration, in the vocabulary of the code. */
export interface WebConfig {
  readonly apiUrl: string;
  readonly wsUrl: string;
  readonly oidc: {
    readonly issuer: string;
    readonly clientId: string;
    readonly scopes: string;
  };
  readonly appVersion: string;
}

/**
 * @param source `import.meta.env`, passed in so a test never has to rebuild to try a bad value
 * @throws {import('@remote-claude/config').ConfigurationError} listing every problem at once
 */
export function loadConfig(source: Record<string, unknown>): WebConfig {
  const env = parseEnvironment(schema, source);

  return {
    apiUrl: env.VITE_API_URL,
    wsUrl: env.VITE_WS_URL,
    oidc: {
      issuer: env.VITE_OIDC_ISSUER,
      clientId: env.VITE_OIDC_CLIENT_ID,
      scopes: env.VITE_OIDC_SCOPES,
    },
    appVersion: env.VITE_APP_VERSION,
  };
}

/** The configuration of this build. */
export const config: WebConfig = loadConfig(import.meta.env as unknown as Record<string, unknown>);
