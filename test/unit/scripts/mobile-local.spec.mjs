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
  it('points the app at the stack the .env describes — every value the app requires', () => {
    expect(definesOf({ ...OIDC, RC_BACKEND_PORT: '3100' })).toEqual({
      RC_API_URL: 'http://localhost:3100',
      RC_WS_URL: 'ws://localhost:3100/ws',
      RC_OIDC_ISSUER: OIDC.OIDC_ISSUER,
      RC_OIDC_CLIENT_ID: 'remote-claude-mobile',
      RC_OIDC_SCOPES: 'openid profile email offline_access',
      RC_OIDC_REDIRECT_URL: MOBILE_REDIRECT_URL,
      RC_APP_VERSION: '1.2.3',
    });
  });

  it('uses the fixed backend port when the .env leaves it unset or empty', () => {
    expect(definesOf(OIDC)['RC_API_URL']).toBe('http://localhost:3000');
    expect(definesOf({ ...OIDC, RC_BACKEND_PORT: ' ' })['RC_API_URL']).toBe(
      'http://localhost:3000',
    );
  });

  it('keeps the issuer byte for byte — the token is checked against it', () => {
    const issuer = 'http://localhost:8180/realms/remote-claude';

    expect(definesOf({ ...OIDC, OIDC_ISSUER: `  ${issuer}  ` })['RC_OIDC_ISSUER']).toBe(issuer);
  });

  it('names every missing variable at once', () => {
    expect(problemsOf({})).toEqual([
      'OIDC_ISSUER is not set in the .env',
      'OIDC_CLIENT_ID_MOBILE is not set in the .env',
      'OIDC_SCOPES is not set in the .env',
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

  it('refuses a backend port that is not a port, alongside the other problems', () => {
    expect(problemsOf({ RC_BACKEND_PORT: '70000', OIDC_ISSUER: OIDC.OIDC_ISSUER })).toEqual([
      'OIDC_CLIENT_ID_MOBILE is not set in the .env',
      'OIDC_SCOPES is not set in the .env',
      'RC_BACKEND_PORT="70000" is not a valid TCP port',
    ]);
  });
});

describe('forwardedPorts', () => {
  it('forwards the API port and the issuer port, in that order', () => {
    expect(forwardedPorts(definesOf({ ...OIDC, RC_BACKEND_PORT: '3100' }))).toEqual([3100, 8180]);
  });

  it('forwards a port once when both share it', () => {
    const defines = definesOf({ ...OIDC, OIDC_ISSUER: 'http://127.0.0.1:3000/realms/x' });

    expect(forwardedPorts(defines)).toEqual([3000]);
  });

  it('leaves an issuer on another machine to be reached directly', () => {
    const defines = definesOf({ ...OIDC, OIDC_ISSUER: 'https://id.example.com/realms/x' });

    expect(forwardedPorts(defines)).toEqual([3000]);
  });

  it('uses the scheme default when the issuer names no port', () => {
    expect(forwardedPorts({ RC_OIDC_ISSUER: 'http://localhost/realms/x' })).toEqual([80]);
    expect(forwardedPorts({ RC_OIDC_ISSUER: 'https://localhost/realms/x' })).toEqual([443]);
  });

  it('forwards the IPv6 loopback too', () => {
    expect(forwardedPorts({ RC_API_URL: 'http://[::1]:3001' })).toEqual([3001]);
  });

  it('answers nothing for values that are absent or not URLs', () => {
    expect(forwardedPorts({ RC_API_URL: 'nope' })).toEqual([]);
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
