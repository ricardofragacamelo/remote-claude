import { describe, expect, it } from 'vitest';

import { ConfigurationError } from '@remote-claude/config';
import { config, loadConfig } from '@/shared/config/env';

const complete = {
  VITE_API_URL: 'http://localhost:3000',
  VITE_WS_URL: 'ws://localhost:3000/ws',
  VITE_OIDC_ISSUER: 'http://localhost:8180/realms/remote-claude',
  VITE_OIDC_CLIENT_ID: 'remote-claude-web',
  VITE_OIDC_SCOPES: 'openid profile email offline_access',
  VITE_APP_VERSION: '0.0.0',
};

describe('loadConfig', () => {
  it('translates the build settings into the vocabulary of the code', () => {
    expect(loadConfig(complete)).toEqual({
      apiUrl: 'http://localhost:3000',
      wsUrl: 'ws://localhost:3000/ws',
      oidc: {
        issuer: 'http://localhost:8180/realms/remote-claude',
        clientId: 'remote-claude-web',
        scopes: 'openid profile email offline_access',
      },
      appVersion: '0.0.0',
    });
  });

  it.each(Object.keys(complete))('refuses to produce a configuration without %s', (variable) => {
    const incomplete = Object.fromEntries(
      Object.entries(complete).filter(([name]) => name !== variable),
    );

    expect(() => loadConfig(incomplete)).toThrow(ConfigurationError);
  });

  it.each([
    ['VITE_API_URL', 'not-a-url'],
    ['VITE_WS_URL', 'http://localhost:3000/ws'],
    ['VITE_OIDC_CLIENT_ID', ''],
  ])('refuses %s set to %s', (variable, value) => {
    expect(() => loadConfig({ ...complete, [variable]: value })).toThrow(ConfigurationError);
  });

  it('names every problem at once', () => {
    expect.assertions(1);

    try {
      loadConfig({});
    } catch (error) {
      expect((error as ConfigurationError).problems).toHaveLength(6);
    }
  });
});

describe('the configuration of this build', () => {
  it('was injected by the bundler, not left to a default at runtime', () => {
    expect(config.apiUrl).toMatch(/^http/);
    expect(config.wsUrl).toMatch(/^ws/);
  });
});
