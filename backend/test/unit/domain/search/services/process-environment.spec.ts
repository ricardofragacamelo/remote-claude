import { describe, expect, it } from 'vitest';

import { ALLOWED_PROCESS_ENV_KEYS, allowedProcessEnv } from '@domain/search';

describe('allowedProcessEnv — ADR-016', () => {
  it('keeps only the allow-listed keys — S-07', () => {
    expect(
      allowedProcessEnv({
        PATH: '/usr/bin',
        HOME: '/home/user',
        LANG: 'en_US.UTF-8',
        LC_ALL: 'C',
        TMPDIR: '/tmp',
        RC_DATABASE_URL: 'postgres://secret',
        OIDC_CLIENT_SECRET: 'top-secret',
        RC_PUSH_CREDENTIALS_FILE: '/etc/push.json',
      }),
    ).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/user',
      LANG: 'en_US.UTF-8',
      LC_ALL: 'C',
      TMPDIR: '/tmp',
    });
  });

  it('omits a key that is absent, rather than passing it through as undefined', () => {
    expect(allowedProcessEnv({ PATH: '/usr/bin' })).toEqual({ PATH: '/usr/bin' });
    expect(allowedProcessEnv({ PATH: '/usr/bin' })).not.toHaveProperty('HOME');
  });

  it('answers an empty object for an empty source', () => {
    expect(allowedProcessEnv({})).toEqual({});
  });

  it('the allow-list is exactly PATH, HOME, LANG, LC_ALL and TMPDIR', () => {
    expect([...ALLOWED_PROCESS_ENV_KEYS].sort()).toEqual(
      ['HOME', 'LANG', 'LC_ALL', 'PATH', 'TMPDIR'].sort(),
    );
  });
});
