import { describe, expect, it } from 'vitest';

import {
  ANDROID_PACKAGE,
  FALLBACK_APP_VERSION,
  flutterRunArgs,
  forwardedPorts,
  localDefines,
  pubspecVersion,
} from '../../../scripts/lib/mobile-local.mjs';
import { MOBILE_REDIRECT_URL } from '../../../scripts/lib/stack.mjs';

/**
 * What `pnpm dev:mobile` compiles the app with: the addresses of the stack `pnpm dev` keeps up,
 * read from the repository `.env`, and the ports the device has to reach on this machine.
 */

/** The OIDC half of a repository `.env`, as `.env.example` ships it. */
const OIDC = {
  OIDC_ISSUER: 'http://localhost:8180/realms/remote-claude',
  OIDC_CLIENT_ID_MOBILE: 'remote-claude-mobile',
  OIDC_SCOPES: 'openid profile email offline_access',
};

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {Record<string, string>}
 */
function definesOf(env) {
  const built = localDefines(env, '1.2.3');
  if (!('defines' in built)) {
    throw new Error(`expected defines, got ${built.problems.join('; ')}`);
  }
  return built.defines;
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {string[]}
 */
function problemsOf(env) {
  const built = localDefines(env, '1.2.3');
  if (!('problems' in built)) {
    throw new Error('expected problems, got defines');
  }
  return built.problems;
}

describe('pubspecVersion', () => {
  it('reads the version pubspec.yaml declares', () => {
    expect(pubspecVersion('name: remote_claude\nversion: 1.4.0+7\n')).toBe('1.4.0+7');
  });

  it('falls back when there is no version line', () => {
    expect(pubspecVersion('name: remote_claude\n')).toBe(FALLBACK_APP_VERSION);
  });

  it('does not take a version nested under another key', () => {
    expect(pubspecVersion('environment:\n  version: 9.9.9\n')).toBe(FALLBACK_APP_VERSION);
  });
});

describe('localDefines', () => {
  it('S-92 · points the app at one origin — the web server — and the realm path, nothing else', () => {
    expect(definesOf({ ...OIDC, RC_WEB_PORT: '5273' })).toEqual({
      RC_INTERNAL_URL: 'http://localhost:5273',
      RC_EXTERNAL_URL: '',
      RC_OIDC_REALM_PATH: '/realms/remote-claude',
      RC_OIDC_CLIENT_ID: 'remote-claude-mobile',
      RC_OIDC_SCOPES: 'openid profile email offline_access',
      RC_OIDC_REDIRECT_URL: MOBILE_REDIRECT_URL,
      RC_APP_VERSION: '1.2.3',
    });
  });

  it('S-92 · no API, socket or issuer of its own any more: they derive from the origin', () => {
    const defines = definesOf(OIDC);

    expect(Object.keys(defines)).not.toContain('RC_API_URL');
    expect(Object.keys(defines)).not.toContain('RC_WS_URL');
    expect(Object.keys(defines)).not.toContain('RC_OIDC_ISSUER');
  });

  it('uses the fixed web port when the .env leaves it unset or empty', () => {
    expect(definesOf(OIDC)['RC_INTERNAL_URL']).toBe('http://localhost:5173');
    expect(definesOf({ ...OIDC, RC_WEB_PORT: ' ' })['RC_INTERNAL_URL']).toBe(
      'http://localhost:5173',
    );
  });

  it('takes the addresses the .env names, as they are written', () => {
    const defines = definesOf({
      ...OIDC,
      RC_INTERNAL_URL: ' https://claude.lan ',
      RC_EXTERNAL_URL: 'https://claude.example.dev',
    });

    expect(defines['RC_INTERNAL_URL']).toBe('https://claude.lan');
    expect(defines['RC_EXTERNAL_URL']).toBe('https://claude.example.dev');
  });

  it('reads the realm path off the issuer, without a trailing slash', () => {
    expect(
      definesOf({ ...OIDC, OIDC_ISSUER: '  http://localhost:8180/realms/other/  ' })[
        'RC_OIDC_REALM_PATH'
      ],
    ).toBe('/realms/other');
  });

  it('names every missing variable at once', () => {
    expect(problemsOf({})).toEqual([
      'OIDC_CLIENT_ID_MOBILE is not set in the .env',
      'OIDC_SCOPES is not set in the .env',
      'OIDC_ISSUER is not set in the .env',
    ]);
  });

  it('reads a variable that is only blanks as missing', () => {
    expect(problemsOf({ ...OIDC, OIDC_SCOPES: '   ' })).toEqual([
      'OIDC_SCOPES is not set in the .env',
    ]);
  });

  it('refuses an issuer that is not a URL', () => {
    expect(problemsOf({ ...OIDC, OIDC_ISSUER: 'keycloak' })).toEqual([
      'OIDC_ISSUER is not a URL: "keycloak"',
    ]);
  });

  it('refuses a port that is not a port, alongside the other problems', () => {
    expect(problemsOf({ RC_WEB_PORT: '70000', OIDC_ISSUER: OIDC.OIDC_ISSUER })).toEqual([
      'OIDC_CLIENT_ID_MOBILE is not set in the .env',
      'OIDC_SCOPES is not set in the .env',
      'RC_WEB_PORT="70000" is not a valid TCP port',
    ]);
  });
});

describe('forwardedPorts', () => {
  it('S-92 · forwards the port of the web server the app talks through', () => {
    expect(forwardedPorts(definesOf({ ...OIDC, RC_WEB_PORT: '5273' }))).toEqual([5273]);
  });

  it('forwards a port once when both addresses share it', () => {
    expect(
      forwardedPorts({
        RC_INTERNAL_URL: 'http://localhost:5173',
        RC_EXTERNAL_URL: 'http://127.0.0.1:5173',
      }),
    ).toEqual([5173]);
  });

  it('leaves an address on another machine to be reached directly', () => {
    const defines = definesOf({ ...OIDC, RC_EXTERNAL_URL: 'https://claude.example.dev' });

    expect(forwardedPorts(defines)).toEqual([5173]);
  });

  it('uses the scheme default when the address names no port', () => {
    expect(forwardedPorts({ RC_INTERNAL_URL: 'http://localhost' })).toEqual([80]);
    expect(forwardedPorts({ RC_INTERNAL_URL: 'https://localhost' })).toEqual([443]);
  });

  it('forwards the IPv6 loopback too', () => {
    expect(forwardedPorts({ RC_INTERNAL_URL: 'http://[::1]:3001' })).toEqual([3001]);
  });

  it('answers nothing for values that are absent or not URLs', () => {
    expect(forwardedPorts({ RC_INTERNAL_URL: 'nope', RC_EXTERNAL_URL: '' })).toEqual([]);
  });
});

describe('flutterRunArgs', () => {
  const defines = { RC_API_URL: 'http://localhost:3000', RC_OIDC_SCOPES: 'openid profile' };

  it('runs on the device it was given, with every define as its own pair of arguments', () => {
    expect(flutterRunArgs('emulator-5554', defines)).toEqual([
      'run',
      '-d',
      'emulator-5554',
      '--dart-define',
      'RC_API_URL=http://localhost:3000',
      '--dart-define',
      'RC_OIDC_SCOPES=openid profile',
    ]);
  });

  it('passes what the person typed after the defines, so theirs win', () => {
    expect(flutterRunArgs('emulator-5554', {}, ['--release'])).toEqual([
      'run',
      '-d',
      'emulator-5554',
      '--release',
    ]);
  });

  it('drops the separator pnpm may pass through, and only a leading one', () => {
    expect(flutterRunArgs('d', {}, ['--', '--release', '--'])).toEqual([
      'run',
      '-d',
      'd',
      '--release',
      '--',
    ]);
  });
});

describe('ANDROID_PACKAGE', () => {
  it('is the application id the Android build declares', async () => {
    const { readFile } = await import('node:fs/promises');
    const gradle = await readFile(
      new URL('../../../mobile/android/app/build.gradle.kts', import.meta.url),
      'utf8',
    );

    expect(gradle).toContain(`applicationId = "${ANDROID_PACKAGE}"`);
  });
});
