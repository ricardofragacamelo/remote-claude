import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appSrc = path.join(repoRoot, 'mobile/android/app/src');

/**
 * What the Android manifests owe the login — properties of XML files, not of any code, and so
 * invisible to every Dart test. The end-to-end suite signs in without the browser, so neither of
 * these would fail it either; both were found running `pnpm dev:mobile` by hand.
 *
 * First, where the app may speak plain HTTP.
 *
 * `pnpm dev:mobile` runs the app against the local stack, which has no TLS. The app's own calls go
 * through Dart and are not affected, but the login is: AppAuth reaches the issuer through the
 * platform, which refuses cleartext unless a network security config allows it. Allowed too
 * widely in the release build, it would let a phone talk to anything over plain HTTP; this is what
 * notices it. In the debug build the platform allows it and the app decides where (plan 10, D-20).
 *
 * @param {string} relative
 * @returns {string}
 */
function read(relative) {
  return fs.readFileSync(path.join(appSrc, relative), 'utf8');
}

describe('cleartext on Android', () => {
  const config = read('debug/res/xml/network_security_config.xml');

  // S-126 · Android cannot name the private network as a range, so the debug build permits
  // cleartext to the platform and `checkOrigin` picks the hosts (plan 10, D-20).
  it('is allowed in debug builds, as a whole, with no list to drift from the app', () => {
    expect(config).toMatch(/<base-config cleartextTrafficPermitted="true"\s*\/>/);
    expect(config).not.toMatch(/<domain-config/);
  });

  it('is what the debug manifest points the app at', () => {
    expect(read('debug/AndroidManifest.xml')).toContain(
      'android:networkSecurityConfig="@xml/network_security_config"',
    );
  });

  it('stays out of the release build', () => {
    const main = read('main/AndroidManifest.xml');

    expect(main).not.toMatch(/networkSecurityConfig|usesCleartextTraffic/);
    expect(fs.existsSync(path.join(appSrc, 'main/res/xml/network_security_config.xml'))).toBe(
      false,
    );
  });
});

describe('the activity the login returns to', () => {
  // flutter_appauth's README, "No Redirect to app after login": with an empty affinity the
  // redirect is handed to an AppAuth activity in a task that never saw the request, and dropped.
  it('keeps the default task affinity, so the redirect finds the request it answers', () => {
    const main = read('main/AndroidManifest.xml').replace(/<!--[\s\S]*?-->/g, '');

    expect(main).toContain('android:name=".MainActivity"');
    expect(main).not.toMatch(/android:taskAffinity=/);
  });
});
