import { describe, expect, it } from 'vitest';

import { API_PREFIX, browserEnvironment, devServer } from '../../env';

/**
 * The browser settings and the dev server, locally and behind the public origin of
 * `pnpm dev:public` (plan 20, B-05) — the forwarding in both (plan 10, B-27).
 */

const PUBLIC = { RC_PUBLIC_URL: 'https://name.ngrok-free.dev' };

describe('browserEnvironment', () => {
  it('gives the bundle exactly the local URLs without a public origin (S-27)', () => {
    for (const source of [{}, { RC_PUBLIC_URL: '' }, { RC_PUBLIC_URL: '   ' }]) {
      expect(browserEnvironment(source, '1.0.0')).toEqual({
        VITE_API_URL: 'http://localhost:3000',
        VITE_WS_URL: 'ws://localhost:3000/ws',
        VITE_OIDC_ISSUER: 'http://localhost:8180/realms/remote-claude',
        VITE_OIDC_CLIENT_ID: 'remote-claude-web',
        VITE_OIDC_SCOPES: 'openid profile email offline_access',
        VITE_APP_VERSION: '1.0.0',
      });
    }
  });

  it('points the API and the WebSocket at the public origin (S-28)', () => {
    const issuer = 'https://name.ngrok-free.dev/realms/remote-claude';

    expect(browserEnvironment({ ...PUBLIC, OIDC_ISSUER: issuer }, '1.0.0')).toMatchObject({
      VITE_API_URL: `https://name.ngrok-free.dev${API_PREFIX}`,
      VITE_WS_URL: 'wss://name.ngrok-free.dev/ws',
      VITE_OIDC_ISSUER: issuer,
    });
  });
});

describe('devServer', () => {
  it('is the port and the forwarding locally, with no public host and no HMR detour (S-29, S-91)', () => {
    for (const source of [{}, { RC_PUBLIC_URL: '' }]) {
      const server = devServer(source);

      expect(server).toMatchObject({ port: 5173, strictPort: true });
      // S-131 · every interface: the phone reaches it by the local network (plan 10, D-23).
      expect(server.host).toBe(true);
      expect(server).not.toHaveProperty('allowedHosts');
      expect(server).not.toHaveProperty('hmr');
      expect(Object.keys(server.proxy ?? {})).toEqual(Object.keys(devServer(PUBLIC).proxy ?? {}));
    }
    expect(devServer({ RC_WEB_PORT: '5999', RC_PUBLIC_URL: '' }).port).toBe(5999);
  });

  it('forwards the same four paths locally, to the ports of the stack (S-91)', () => {
    const server = devServer({ RC_BACKEND_PORT: '3999', RC_KEYCLOAK_PORT: '8999' });

    expect(server.proxy).toEqual({
      '^/api(/|\\?|$)': expect.objectContaining({
        target: 'http://localhost:3999',
        cookiePathRewrite: { '/auth': '/api/auth' },
      }),
      '^/ws(\\?|$)': { target: 'http://localhost:3999', ws: true },
      '^/realms/': { target: 'http://localhost:8999' },
      '^/resources/': { target: 'http://localhost:8999' },
    });
  });

  it('accepts the public host, sends HMR through 443 and forwards four paths (S-30)', () => {
    const server = devServer({ ...PUBLIC, RC_BACKEND_PORT: '3999', RC_KEYCLOAK_PORT: '8999' });

    expect(server).toMatchObject({
      port: 5173,
      strictPort: true,
      allowedHosts: ['name.ngrok-free.dev'],
      hmr: { protocol: 'wss', clientPort: 443 },
    });
    // S-131 · behind the tunnel, the loopback the tunnel connects to: no local network.
    expect(server).not.toHaveProperty('host');
    expect(server.proxy).toEqual({
      '^/api(/|\\?|$)': expect.objectContaining({
        target: 'http://localhost:3999',
        cookiePathRewrite: { '/auth': '/api/auth' },
      }),
      '^/ws(\\?|$)': { target: 'http://localhost:3999', ws: true },
      '^/realms/': { target: 'http://localhost:8999' },
      '^/resources/': { target: 'http://localhost:8999' },
    });
  });

  it('strips the API prefix, and never forwards an empty path', () => {
    const api = devServer(PUBLIC).proxy?.['^/api(/|\\?|$)'];
    const rewrite = typeof api === 'object' ? api.rewrite : undefined;

    expect(rewrite?.('/api/sessions?limit=1')).toBe('/sessions?limit=1');
    expect(rewrite?.('/api')).toBe('/');
  });

  it.each([
    ['public', PUBLIC],
    ['local', {}],
  ])(
    'forwards nothing that leads to the admin console in %s mode (D-06, S-91)',
    (_mode, source) => {
      const paths = Object.keys(devServer(source).proxy ?? {});

      expect(paths.some((key) => new RegExp(key).test('/admin/master/console/'))).toBe(false);
      expect(paths.some((key) => new RegExp(key).test('/admin/remote-claude/console/'))).toBe(
        false,
      );
    },
  );
});
