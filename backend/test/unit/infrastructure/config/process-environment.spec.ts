import { afterEach, describe, expect, it } from 'vitest';

import { processEnvironment } from '@infra/config/process-environment';

const original = { ...process.env };

afterEach(() => {
  process.env = { ...original };
});

describe('processEnvironment', () => {
  it('reads each variable the schema declares, by name', () => {
    process.env['OIDC_AUDIENCE'] = 'https://api.example';

    expect(processEnvironment().OIDC_AUDIENCE).toBe('https://api.example');
  });

  it('reports an unset variable as undefined rather than inventing a value', () => {
    delete process.env['OIDC_SCOPES'];

    expect(processEnvironment().OIDC_SCOPES).toBeUndefined();
  });

  it('covers exactly the variables the schema expects', () => {
    expect(Object.keys(processEnvironment()).sort()).toEqual([
      'DATABASE_URL',
      'LOG_LEVEL',
      'NODE_ENV',
      'OIDC_AUDIENCE',
      'OIDC_CLIENT_ID_MOBILE',
      'OIDC_CLIENT_ID_WEB',
      'OIDC_ISSUER',
      'OIDC_SCOPES',
      'RC_BACKEND_PORT',
      'RC_WEB_PORT',
    ]);
  });
});
