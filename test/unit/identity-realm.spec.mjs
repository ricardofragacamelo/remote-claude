import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * The realm the installation imports into its own identity provider (plan 05, D-05).
 *
 * The backend never sees a refresh token rotate — the provider does that — so whether a reused
 * token revokes its family is a property of **this file**, not of any code. A realm exported
 * again from an admin console that had the switch off would disarm the leak detection in silence;
 * this is what notices (S-75).
 *
 * @type {Record<string, unknown> & { clients: Record<string, unknown>[], users: Record<string, unknown>[] }}
 */
const realm = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'infra/keycloak/realm-remote-claude.json'), 'utf8'),
);

describe('the identity realm', () => {
  it('rotates the refresh token on every use, and tolerates no reuse (S-75)', () => {
    expect(realm['revokeRefreshToken']).toBe(true);
    expect(realm['refreshTokenMaxReuse']).toBe(0);
  });

  it('keeps the access token short: renewal is what the rotation is for', () => {
    expect(realm['accessTokenLifespan']).toBeLessThanOrEqual(900);
  });

  it('verifies every seeded address, because the backend refuses the unverified (S-61)', () => {
    for (const user of realm.users) {
      expect({ user: user['username'], emailVerified: user['emailVerified'] }).toEqual({
        user: user['username'],
        emailVerified: true,
      });
    }
  });

  it('makes every client public and PKCE-bound, so no secret ships in a bundle', () => {
    for (const client of realm.clients.filter((entry) => entry['redirectUris'] !== undefined)) {
      expect(client['publicClient']).toBe(true);
    }

    for (const id of ['remote-claude-web', 'remote-claude-mobile']) {
      const client = realm.clients.find((entry) => entry['clientId'] === id);
      expect(client?.['attributes']).toMatchObject({ 'pkce.code.challenge.method': 'S256' });
      expect(client?.['attributes']).toHaveProperty('post.logout.redirect.uris');
    }
  });
});
