import { existsSync, mkdirSync, rmSync } from 'node:fs';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { startPostgres } from '../../../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../../../support/containers/postgres';
import {
  createGitMarketplaceFixture,
  marketplaceManifestJson,
  pluginManifestJson,
} from '../../../../../../support/fixtures/git-marketplace-fixture';
import type { GitMarketplaceFixture } from '../../../../../../support/fixtures/git-marketplace-fixture';
import { startIdentityServer } from '../../../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../../../support/app/test-app';
import type { TestApp } from '../../../../../../support/app/test-app';

const OTHER = 'auth|plugins-marketplace-other';

/**
 * `/engines/claude/plugins/marketplaces…` and the marketplace routes of
 * `/engines/claude/plugins…` (plan 13, B-47) — over a real local git repository, never the network
 * (D-19's discipline, carried to the one feature of this plan that actually clones something).
 */
describe('/engines/claude/plugins — marketplaces, plan 13, B-47', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let token: string;
  let other: string;
  let fixture: GitMarketplaceFixture;
  let unreachable: string;
  let pluginDownloadDir: string;

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    fixture = createGitMarketplaceFixture();
    fixture.commit({
      '.claude-plugin/marketplace.json': marketplaceManifestJson('acme', [
        { name: 'my-plugin', source: 'plugins/my-plugin', description: 'A fixture plugin' },
        {
          name: 'unsupported',
          source: { type: 'git', url: 'https://example.invalid/another-repo.git' },
          description: 'points at another repo',
        },
      ]),
      'plugins/my-plugin/.claude-plugin/plugin.json': pluginManifestJson('my-plugin'),
      'plugins/my-plugin/commands/deploy.md': '# deploy',
    });
    // A path with nothing at it: `git clone` of it fails exactly like a real unreachable remote
    // would, with no network needed to prove it (D-19's discipline).
    unreachable = `${fixture.url}-does-not-exist`;

    const allowlist = writeTestAllowlist(
      [SUBJECT, OTHER],
      [
        { name: 'acme', url: fixture.url },
        { name: 'ghost-source', url: unreachable },
      ],
    );
    harness = await startTestApp(database.url, identity, undefined, allowlist);
    token = await identity.accessToken({ subject: SUBJECT });
    other = await identity.accessToken({ subject: OTHER });
    // Captured once the app (and `testEnvironment()` inside it) has set it — every install this
    // suite makes lands under here, deterministically by (user, marketplace, plugin).
    pluginDownloadDir = process.env['RC_PLUGIN_DOWNLOAD_DIR'] ?? '';
  });

  afterAll(async () => {
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  beforeEach(async () => {
    await harness.app
      .get<PersistenceContext>(PERSISTENCE_CONTEXT)
      .db.execute('DELETE FROM claude_plugins');
    // The DB alone is not enough: a deterministic install path left over from the previous test
    // would make the next one's `commit()` (a plain `fs.rename` into a fresh destination) fail on
    // a directory that already has content — a test-isolation concern, never a production one
    // (`RemovePluginUseCase` always deletes the directory together with the row).
    rmSync(pluginDownloadDir, { recursive: true, force: true });
    mkdirSync(pluginDownloadDir, { recursive: true });
  });

  const http = (): request.Agent => request(harness.app.getHttpServer());
  const asAuth = (req: request.Test, as = token): request.Test =>
    req.set('authorization', `Bearer ${as}`);
  const get = (route: string, as = token) => asAuth(http().get(route), as);
  const post = (route: string, body: object, as = token) =>
    asAuth(http().post(route), as).send(body);
  const del = (route: string, as = token) => asAuth(http().delete(route), as);

  describe('GET .../marketplaces', () => {
    it('lists every declared marketplace, by name', async () => {
      const response = await get('/engines/claude/plugins/marketplaces');
      expect(response.status).toBe(200);
      expect(response.body.marketplaces).toEqual(
        expect.arrayContaining([{ name: 'acme' }, { name: 'ghost-source' }]),
      );
    });

    it('answers 401 without a bearer token', async () => {
      const response = await request(harness.app.getHttpServer()).get(
        '/engines/claude/plugins/marketplaces',
      );
      expect(response.status).toBe(401);
    });
  });

  describe('GET .../marketplaces/:name', () => {
    it('lists a declared marketplace’s own catalogue, marking the unsupported entry', async () => {
      const response = await get('/engines/claude/plugins/marketplaces/acme');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        name: 'acme',
        plugins: [
          { name: 'my-plugin', description: 'A fixture plugin', supported: true },
          { name: 'unsupported', description: 'points at another repo', supported: false },
        ],
      });
    });

    it('answers 403 for a marketplace the allowlist does not declare — S-201', async () => {
      const response = await get('/engines/claude/plugins/marketplaces/ghost');
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('PLUGIN_MARKETPLACE_NOT_ALLOWED');
    });

    it('answers 502 for a declared marketplace whose source cannot be reached — S-203', async () => {
      const response = await get('/engines/claude/plugins/marketplaces/ghost-source');
      expect(response.status).toBe(502);
      expect(response.body.error.code).toBe('PLUGIN_SOURCE_UNAVAILABLE');
    });
  });

  describe('POST /engines/claude/plugins/marketplace', () => {
    it('installs a plugin and composes-ready — 201, present in the list — S-200', async () => {
      const response = await post('/engines/claude/plugins/marketplace', {
        marketplace: 'acme',
        plugin: 'my-plugin',
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        origin: 'marketplace',
        marketplace: 'acme',
        name: 'my-plugin',
        state: 'current',
        enabled: true,
      });
      expect(typeof response.body.commit).toBe('string');
      expect(response.body.commit).toHaveLength(40);
      expect(existsSync(response.body.path)).toBe(true);

      const list = await get('/engines/claude/plugins');
      expect(list.body.plugins).toHaveLength(1);
      expect(list.body.plugins[0].id).toBe(response.body.id);
    });

    it('answers 403 installing from a marketplace the allowlist does not declare — S-201', async () => {
      const response = await post('/engines/claude/plugins/marketplace', {
        marketplace: 'ghost',
        plugin: 'my-plugin',
      });
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('PLUGIN_MARKETPLACE_NOT_ALLOWED');
    });

    it('answers 502 installing from a declared marketplace whose source cannot be reached — S-203', async () => {
      const response = await post('/engines/claude/plugins/marketplace', {
        marketplace: 'ghost-source',
        plugin: 'my-plugin',
      });
      expect(response.status).toBe(502);
      expect(response.body.error.code).toBe('PLUGIN_SOURCE_UNAVAILABLE');
      expect((await get('/engines/claude/plugins')).body.plugins).toEqual([]);
    });

    it('answers 404 for a plugin the marketplace does not list', async () => {
      const response = await post('/engines/claude/plugins/marketplace', {
        marketplace: 'acme',
        plugin: 'nope',
      });
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('PLUGIN_NOT_FOUND');
    });

    it('answers 422 for a plugin whose source is not a supported kind — S-204', async () => {
      const response = await post('/engines/claude/plugins/marketplace', {
        marketplace: 'acme',
        plugin: 'unsupported',
      });
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('PLUGIN_PATH_INVALID');
    });

    it('is idempotent — installing the same plugin twice answers the same row — S-207', async () => {
      const first = await post('/engines/claude/plugins/marketplace', {
        marketplace: 'acme',
        plugin: 'my-plugin',
      });
      const second = await post('/engines/claude/plugins/marketplace', {
        marketplace: 'acme',
        plugin: 'my-plugin',
      });

      expect(second.status).toBe(201);
      expect(second.body.id).toBe(first.body.id);
      expect((await get('/engines/claude/plugins')).body.plugins).toHaveLength(1);
    });

    it('two concurrent installs of the same plugin leave exactly one row and one directory — S-208', async () => {
      const [a, b] = await Promise.all([
        post('/engines/claude/plugins/marketplace', { marketplace: 'acme', plugin: 'my-plugin' }),
        post('/engines/claude/plugins/marketplace', { marketplace: 'acme', plugin: 'my-plugin' }),
      ]);

      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      expect(a.body.id).toBe(b.body.id);
      expect(a.body.path).toBe(b.body.path);

      const list = await get('/engines/claude/plugins');
      expect(list.body.plugins).toHaveLength(1);
    });

    it('answers 401 without a bearer token', async () => {
      const response = await request(harness.app.getHttpServer())
        .post('/engines/claude/plugins/marketplace')
        .send({ marketplace: 'acme', plugin: 'my-plugin' });
      expect(response.status).toBe(401);
    });
  });

  describe('update — GET and POST .../:id/update, plan 13, S-205', () => {
    it('answers no update available right after installing', async () => {
      const added = await post('/engines/claude/plugins/marketplace', {
        marketplace: 'acme',
        plugin: 'my-plugin',
      });

      const check = await get(`/engines/claude/plugins/${String(added.body.id)}/update`);

      expect(check.status).toBe(200);
      expect(check.body).toMatchObject({ available: false, diff: null });
    });

    it('answers an update is available, with the diff, after the marketplace moves — and applies it only on POST', async () => {
      const added = await post('/engines/claude/plugins/marketplace', {
        marketplace: 'acme',
        plugin: 'my-plugin',
      });
      const oldCommit = added.body.commit as string;
      expect(added.body.manifest.commands).toEqual(['deploy']);

      fixture.commit({
        'plugins/my-plugin/commands/rollback.md': '# rollback',
      });

      const check = await get(`/engines/claude/plugins/${String(added.body.id)}/update`);
      expect(check.status).toBe(200);
      expect(check.body.available).toBe(true);
      expect(check.body.newCommit).not.toBe(oldCommit);
      expect(check.body.diff.commandsAdded).toEqual(['rollback']);

      // A check alone never changes what is installed.
      const stillOld = await get('/engines/claude/plugins');
      expect(stillOld.body.plugins[0].commit).toBe(oldCommit);

      const applied = await post(`/engines/claude/plugins/${String(added.body.id)}/update`, {});
      expect(applied.status).toBe(200);
      expect(applied.body.commit).toBe(check.body.newCommit);
      expect(applied.body.manifest.commands).toEqual(['deploy', 'rollback']);
    });

    it("refuses applying somebody else's update", async () => {
      const added = await post('/engines/claude/plugins/marketplace', {
        marketplace: 'acme',
        plugin: 'my-plugin',
      });

      const response = await post(
        `/engines/claude/plugins/${String(added.body.id)}/update`,
        {},
        other,
      );
      expect(response.status).toBe(403);
    });
  });

  describe('removing a marketplace plugin — plan 13, S-209', () => {
    it('deletes the row and the directory it downloaded', async () => {
      const added = await post('/engines/claude/plugins/marketplace', {
        marketplace: 'acme',
        plugin: 'my-plugin',
      });
      expect(existsSync(added.body.path)).toBe(true);

      const removed = await del(`/engines/claude/plugins/${String(added.body.id)}`);
      expect(removed.status).toBe(204);
      expect(existsSync(added.body.path)).toBe(false);
    });
  });

  describe('cross-user isolation — plan 13, S-210', () => {
    it("never shows one user's marketplace plugin to another", async () => {
      const added = await post('/engines/claude/plugins/marketplace', {
        marketplace: 'acme',
        plugin: 'my-plugin',
      });

      expect((await get('/engines/claude/plugins', other)).body.plugins).toEqual([]);
      expect(
        (await post(`/engines/claude/plugins/${String(added.body.id)}/update`, {}, other)).status,
      ).toBe(403);
      expect((await del(`/engines/claude/plugins/${String(added.body.id)}`, other)).status).toBe(
        403,
      );
    });

    it('installs independently for two different users — different directories, both present', async () => {
      const mine = await post('/engines/claude/plugins/marketplace', {
        marketplace: 'acme',
        plugin: 'my-plugin',
      });
      const theirs = await post(
        '/engines/claude/plugins/marketplace',
        { marketplace: 'acme', plugin: 'my-plugin' },
        other,
      );

      expect(mine.body.id).not.toBe(theirs.body.id);
      expect(mine.body.path).not.toBe(theirs.body.path);
      expect(existsSync(mine.body.path)).toBe(true);
      expect(existsSync(theirs.body.path)).toBe(true);
    });
  });
});
