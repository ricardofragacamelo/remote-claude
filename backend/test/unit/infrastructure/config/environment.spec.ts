import { describe, expect, it } from 'vitest';

import { ConfigurationError } from '@remote-claude/config';
import { loadConfig } from '@infra/config/environment';
import type { RawEnvironment } from '@infra/config/environment';

const complete: RawEnvironment = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'debug',
  RC_BACKEND_PORT: '3000',
  RC_WEB_PORT: '5173',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  OIDC_ISSUER: 'http://localhost:8180/realms/remote-claude',
  OIDC_AUDIENCE: 'https://api.remote-claude.local',
  OIDC_CLIENT_ID_WEB: 'remote-claude-web',
  OIDC_CLIENT_ID_MOBILE: 'remote-claude-mobile',
  OIDC_SCOPES: 'openid profile email offline_access',
};

/** The complete environment, with one variable changed or removed. */
function withChange(change: Partial<RawEnvironment>): RawEnvironment {
  return { ...complete, ...change };
}

describe('loadConfig', () => {
  it('translates the environment into the vocabulary of the code', () => {
    const config = loadConfig(complete);

    expect(config).toEqual({
      nodeEnv: 'test',
      logLevel: 'debug',
      port: 3000,
      webOrigin: 'http://localhost:5173',
      databaseUrl: 'postgresql://u:p@localhost:5432/db',
      oidc: {
        issuer: 'http://localhost:8180/realms/remote-claude',
        audience: 'https://api.remote-claude.local',
        webClientId: 'remote-claude-web',
        mobileClientId: 'remote-claude-mobile',
        scopes: 'openid profile email offline_access',
      },
    });
  });

  it.each([
    'NODE_ENV',
    'LOG_LEVEL',
    'RC_BACKEND_PORT',
    'RC_WEB_PORT',
    'DATABASE_URL',
    'OIDC_ISSUER',
    'OIDC_AUDIENCE',
    'OIDC_CLIENT_ID_WEB',
    'OIDC_CLIENT_ID_MOBILE',
    'OIDC_SCOPES',
  ] as const)('refuses to produce a configuration when %s is missing', (variable) => {
    expect(() => loadConfig(withChange({ [variable]: undefined }))).toThrow(ConfigurationError);
  });

  it.each([
    ['NODE_ENV', 'staging'],
    ['LOG_LEVEL', 'verbose'],
    ['RC_BACKEND_PORT', 'nope'],
    ['RC_BACKEND_PORT', '0'],
    ['RC_BACKEND_PORT', '65536'],
    ['DATABASE_URL', 'mysql://localhost/db'],
    ['OIDC_ISSUER', 'not-a-url'],
  ] as const)('refuses %s set to %s', (variable, value) => {
    expect(() => loadConfig(withChange({ [variable]: value }))).toThrow(ConfigurationError);
  });

  it('accepts the boundary ports', () => {
    expect(loadConfig(withChange({ RC_BACKEND_PORT: '1' })).port).toBe(1);
    expect(loadConfig(withChange({ RC_BACKEND_PORT: '65535' })).port).toBe(65_535);
  });

  it('names the variable and what was expected, so the message is actionable', () => {
    expect.assertions(2);

    try {
      loadConfig(withChange({ RC_BACKEND_PORT: 'nope' }));
    } catch (error) {
      expect((error as ConfigurationError).problems[0]).toContain('RC_BACKEND_PORT');
      expect((error as ConfigurationError).message).toContain('invalid environment');
    }
  });

  it('lists every problem at once, instead of one boot attempt per mistake', () => {
    expect.assertions(1);

    try {
      loadConfig(withChange({ NODE_ENV: undefined, LOG_LEVEL: undefined }));
    } catch (error) {
      expect((error as ConfigurationError).problems).toHaveLength(2);
    }
  });
});
