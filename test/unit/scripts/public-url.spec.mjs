import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ORIGIN_REFUSALS,
  PUBLIC_URL_VARIABLE,
  composeFiles,
  localEnvironment,
  parsePublicOrigin,
  parseStartArgs,
  publicEnvironment,
  publicIssuer,
} from '../../../scripts/lib/public-url.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * The public origin of `pnpm dev:public`, and the environment it turns into (plan 20, B-01, B-04).
 */

const LOCAL_ISSUER = 'http://localhost:8180/realms/remote-claude';

describe('parsePublicOrigin', () => {
  it('accepts an https origin, and gives its host (S-01)', () => {
    expect(parsePublicOrigin('https://name.ngrok-free.dev')).toEqual({
      ok: true,
      origin: 'https://name.ngrok-free.dev',
      host: 'name.ngrok-free.dev',
    });
  });

  it('gives a bare host the https scheme (S-02)', () => {
    expect(parsePublicOrigin('  name.ngrok-free.dev ')).toMatchObject({
      ok: true,
      origin: 'https://name.ngrok-free.dev',
    });
  });

  it('accepts a trailing slash, and drops it from the origin (S-03)', () => {
    expect(parsePublicOrigin('https://name.ngrok-free.dev/')).toMatchObject({
      ok: true,
      origin: 'https://name.ngrok-free.dev',
    });
  });

  it('refuses clear text: off the loopback, only TLS (S-04)', () => {
    expect(parsePublicOrigin('http://name.ngrok-free.dev')).toEqual({
      ok: false,
      reason: 'not-https',
    });
  });

  it.each([
    'https://name.ngrok-free.dev/app',
    'https://name.ngrok-free.dev?x=1',
    'https://name.ngrok-free.dev#top',
    'https://name.ngrok-free.dev:8443',
    'https://user:secret@name.ngrok-free.dev',
  ])('refuses %s: not an origin (S-05)', (value) => {
    expect(parsePublicOrigin(value)).toEqual({ ok: false, reason: 'not-an-origin' });
  });

  it.each(['', '   ', 'https://', 'https://exa mple.dev'])(
    'refuses %j as unreadable (S-06)',
    (value) => {
      expect(parsePublicOrigin(value)).toEqual({ ok: false, reason: 'unreadable' });
    },
  );

  it('has a line for the operator for every refusal', () => {
    expect(Object.keys(ORIGIN_REFUSALS).sort()).toEqual([
      'not-an-origin',
      'not-https',
      'unreadable',
    ]);
  });
});

describe('publicIssuer', () => {
  it('keeps the realm path and moves it to the public origin (S-07)', () => {
    expect(publicIssuer('https://name.ngrok-free.dev', LOCAL_ISSUER)).toBe(
      'https://name.ngrok-free.dev/realms/remote-claude',
    );
  });

  it('drops a trailing slash of the local issuer', () => {
    expect(publicIssuer('https://h.dev', `${LOCAL_ISSUER}/`)).toBe(
      'https://h.dev/realms/remote-claude',
    );
  });
});

describe('publicEnvironment and localEnvironment', () => {
  const env = { OIDC_ISSUER: LOCAL_ISSUER, RC_WEB_PORT: '5173' };

  it('sets the origin and the public issuer, and keeps the rest', () => {
    expect(publicEnvironment(env, 'https://h.dev')).toEqual({
      OIDC_ISSUER: 'https://h.dev/realms/remote-claude',
      RC_WEB_PORT: '5173',
      [PUBLIC_URL_VARIABLE]: 'https://h.dev',
    });
  });

  it('gives the same environment when applied to its own output (S-09)', () => {
    const once = publicEnvironment(env, 'https://h.dev');
    expect(publicEnvironment(once, 'https://h.dev')).toEqual(once);
  });

  it('refuses to build one without an issuer', () => {
    expect(() => publicEnvironment({}, 'https://h.dev')).toThrow(/OIDC_ISSUER is not set/);
    expect(() => publicEnvironment({ OIDC_ISSUER: '' }, 'https://h.dev')).toThrow(/OIDC_ISSUER/);
  });

  it('blanks an RC_PUBLIC_URL left in .env, without deleting it (S-08)', () => {
    const local = localEnvironment({ ...env, [PUBLIC_URL_VARIABLE]: 'https://h.dev' });

    expect(local[PUBLIC_URL_VARIABLE]).toBe('');
    expect(local['OIDC_ISSUER']).toBe(LOCAL_ISSUER);
  });
});

describe('parseStartArgs', () => {
  it('is local with no arguments', () => {
    expect(parseStartArgs([])).toEqual({ ok: true, public: false, url: null });
  });

  it('reads --public, and --url after it or before it', () => {
    expect(parseStartArgs(['--public'])).toEqual({ ok: true, public: true, url: null });
    expect(parseStartArgs(['--public', '--url', 'h.dev'])).toEqual({
      ok: true,
      public: true,
      url: 'h.dev',
    });
    expect(parseStartArgs(['--url', 'h.dev', '--public'])).toMatchObject({ url: 'h.dev' });
  });

  it('refuses --url without --public, which would do nothing', () => {
    expect(parseStartArgs(['--url', 'h.dev'])).toEqual({
      ok: false,
      message: '--url only makes sense with --public',
    });
  });

  it.each([[['--verbose']], [['--public', '--url']]])('refuses %j', (argv) => {
    expect(parseStartArgs(argv)).toMatchObject({ ok: false, message: /unknown argument/ });
  });
});

describe('the compose files of a run', () => {
  it('adds the public override on top of the base file only in public mode (S-24, S-25)', () => {
    expect(composeFiles(true)).toEqual(['docker-compose.yml', 'docker-compose.public.yml']);
    expect(composeFiles(false)).toEqual([]);
  });

  it('keeps the override to the identity provider, and to its two settings (S-26)', () => {
    const override = fs.readFileSync(path.join(repoRoot, 'docker-compose.public.yml'), 'utf8');
    const settings = override
      .split('\n')
      .filter((row) => !row.trimStart().startsWith('#') && row.trim() !== '');

    expect(settings).toEqual([
      'services:',
      '  keycloak:',
      '    environment:',
      '      KC_HOSTNAME: ${RC_PUBLIC_URL:?RC_PUBLIC_URL is set by pnpm dev:public}',
      '      KC_PROXY_HEADERS: xforwarded',
    ]);
  });
});
