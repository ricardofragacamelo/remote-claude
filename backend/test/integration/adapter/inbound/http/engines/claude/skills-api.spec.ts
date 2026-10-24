import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { QUERY_FACTORY } from '@adapter/outbound/engines/claude/query.factory';
import { PERSISTENCE_CONTEXT } from '@infra/database/persistence-context';
import type { PersistenceContext } from '@infra/database/persistence-context';
import { scriptedSdk } from '../../../../../../fakes/agent-sdk/scripted-query';
import { startPostgres } from '../../../../../../support/containers/postgres';
import type { DisposablePostgres } from '../../../../../../support/containers/postgres';
import { startIdentityServer } from '../../../../../../support/identity/identity-server';
import type { IdentityServer } from '../../../../../../support/identity/identity-server';
import { startTestApp, SUBJECT, writeTestAllowlist } from '../../../../../../support/app/test-app';
import type { TestApp } from '../../../../../../support/app/test-app';
import type { SlashCommand } from '@anthropic-ai/claude-agent-sdk';

const OTHER = 'auth|skills-api-other';

function skill(name: string, description = ''): SlashCommand {
  return { name, description, argumentHint: '', aliases: [], builtin: false };
}

describe('/engines/claude/skills — plan 13, B-34', () => {
  let database: DisposablePostgres;
  let identity: IdentityServer;
  let harness: TestApp;
  let token: string;
  let other: string;
  let root: string;

  beforeAll(async () => {
    database = await startPostgres();
    identity = await startIdentityServer();
    const allowlist = writeTestAllowlist([SUBJECT]);
    root = allowlist.root;
    mkdirSync(path.join(root, 'repo'), { recursive: true });

    const scripted = scriptedSdk({
      fixture: 'text-turn',
      skills: [skill('review', 'Reviews a PR'), skill('remote-claude-user:review', 'Drafts')],
    });
    harness = await startTestApp(
      database.url,
      identity,
      (builder) => builder.overrideProvider(QUERY_FACTORY).useValue(scripted.createQuery),
      allowlist,
    );
    token = await identity.accessToken({ subject: SUBJECT });
    other = await identity.accessToken({ subject: OTHER });
  });

  afterAll(async () => {
    await harness.close();
    await identity.stop();
    await database.stop();
  });

  beforeEach(async () => {
    // `audit_events` keeps a 90-day retention floor — a trigger refuses any `DELETE` of it, even
    // in a test (the same rule the trail protects itself with everywhere). Trail assertions count
    // the delta around the action instead of starting from zero (the same pattern S-43 uses).
    await harness.app
      .get<PersistenceContext>(PERSISTENCE_CONTEXT)
      .db.execute('DELETE FROM claude_skill_preferences');
  });

  const http = (): request.Agent => request(harness.app.getHttpServer());
  const asAuth = (req: request.Test, as = token): request.Test =>
    req.set('authorization', `Bearer ${as}`);
  const get = (route: string, as = token) => asAuth(http().get(route), as);
  const put = (route: string, body: object, as = token) => asAuth(http().put(route), as).send(body);

  const repo = (): string => path.join(root, 'repo');
  const skillsUrl = (): string => `/engines/claude/skills?folder=${encodeURIComponent(repo())}`;

  function write(relativePath: string, content: string): void {
    const full = path.join(repo(), relativePath);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content, 'utf8');
  }

  it('lists the project’s own skill, with its source file, enabled by default (S-154)', async () => {
    write('.claude/skills/review/SKILL.md', '---\nname: review\n---\n');

    const response = await get(skillsUrl());

    expect(response.status).toBe(200);
    expect(response.body.skills).toContainEqual({
      name: 'review',
      origin: 'project',
      description: 'Reviews a PR',
      sourceFile: '.claude/skills/review/SKILL.md',
      enabled: true,
      unloadedReason: null,
    });
  });

  it('lists a colliding project and user skill of the same name, both, with their own badge (S-157)', async () => {
    const response = await get(skillsUrl());

    expect(response.status).toBe(200);
    const matches = response.body.skills.filter((row: { name: string }) => row.name === 'review');
    expect(matches.map((row: { origin: string }) => row.origin).sort()).toEqual([
      'project',
      'user',
    ]);
  });

  it('refuses a malformed skill name on save (S-160)', async () => {
    const response = await put('/engines/claude/skills/preferences', {
      sources: {},
      disabledSkills: ['Not A Valid Name'],
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_INPUT');
  });

  it('refuses the folder override of somebody else’s folder (S-161)', async () => {
    const response = await put(
      '/engines/claude/skills/preferences',
      { folder: repo(), sources: {}, disabledSkills: [] },
      other,
    );

    expect(response.status).toBe(403);
  });

  it('refuses a folder outside the allowlist entirely', async () => {
    const response = await put('/engines/claude/skills/preferences', {
      folder: '/not/allowed',
      sources: {},
      disabledSkills: [],
    });

    expect(response.status).toBe(403);
  });

  it('leaves one of two saves at once, whole — never a mix of the two (S-162)', async () => {
    const [first, second] = await Promise.all([
      put('/engines/claude/skills/preferences', { sources: { user: true }, disabledSkills: [] }),
      put('/engines/claude/skills/preferences', { sources: { system: true }, disabledSkills: [] }),
    ]);
    expect([first.status, second.status]).toEqual([200, 200]);

    const row = (
      await harness.app
        .get<PersistenceContext>(PERSISTENCE_CONTEXT)
        .db.execute(
          `SELECT sources, disabled_skills AS "disabledSkills" FROM claude_skill_preferences WHERE user_id = 'auth|42' AND folder_path IS NULL`,
        )
    ).rows[0];

    expect([
      { sources: { user: true }, disabledSkills: [] },
      { sources: { system: true }, disabledSkills: [] },
    ]).toContainEqual(row);
  });

  it('records engine.skillSourceToggled turning an origin on, once per distinct change (S-163, S-164)', async () => {
    const context = harness.app.get<PersistenceContext>(PERSISTENCE_CONTEXT);
    const count = async () =>
      Number(
        (
          await context.db.execute(
            `SELECT count(*) AS n FROM audit_events WHERE kind = 'engine.skillSourceToggled'`,
          )
        ).rows[0]?.['n'],
      );
    const before = await count();

    expect(
      (
        await put('/engines/claude/skills/preferences', {
          sources: { user: true },
          disabledSkills: [],
        })
      ).status,
    ).toBe(200);
    expect((await count()) - before).toBe(1);

    // The same value again: no new row, no new event (S-163).
    expect(
      (
        await put('/engines/claude/skills/preferences', {
          sources: { user: true },
          disabledSkills: [],
        })
      ).status,
    ).toBe(200);
    expect((await count()) - before).toBe(1);

    // Turning it off again: narrowing, no trail entry (D-20’s asymmetry).
    expect(
      (
        await put('/engines/claude/skills/preferences', {
          sources: { user: false },
          disabledSkills: [],
        })
      ).status,
    ).toBe(200);
    expect((await count()) - before).toBe(1);
  });

  it('saves the preference — read back, it narrows `enabled` on the matching skill', async () => {
    await put('/engines/claude/skills/preferences', {
      sources: { user: true },
      disabledSkills: ['remote-claude-user:review'],
    });

    const response = await get(skillsUrl());
    const userSkill = response.body.skills.find(
      (row: { name: string; origin: string }) => row.name === 'review' && row.origin === 'user',
    );
    expect(userSkill.enabled).toBe(false);
  });

  it('saves a folder’s own preference, separately from the user’s own', async () => {
    expect(
      (
        await put('/engines/claude/skills/preferences', {
          sources: { user: true },
          disabledSkills: [],
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await put('/engines/claude/skills/preferences', {
          folder: repo(),
          sources: { system: true },
          disabledSkills: [],
        })
      ).status,
    ).toBe(200);

    const row = (
      await harness.app
        .get<PersistenceContext>(PERSISTENCE_CONTEXT)
        .db.execute(
          `SELECT sources, disabled_skills AS "disabledSkills" FROM claude_skill_preferences WHERE user_id = 'auth|42' AND folder_path = '${repo()}'`,
        )
    ).rows[0];
    expect(row).toEqual({ sources: { system: true }, disabledSkills: [] });

    // Both the user's own row and the folder's own now exist together: a read sees both (the
    // repository's own fan-out between the two, not just the one this test happened to touch last).
    const userSkill = (await get(skillsUrl())).body.skills.find(
      (skill: { name: string; origin: string }) =>
        skill.name === 'review' && skill.origin === 'user',
    );
    expect(userSkill.enabled).toBe(false);
  });

  it('refuses a folder outside the allowlist on read', async () => {
    const response = await get('/engines/claude/skills?folder=/not/allowed');
    expect(response.status).toBe(403);
  });

  it('rejects a request with no bearer token at all', async () => {
    expect((await http().get(skillsUrl())).status).toBe(401);
    expect(
      (
        await http()
          .put('/engines/claude/skills/preferences')
          .send({ sources: {}, disabledSkills: [] })
      ).status,
    ).toBe(401);
  });
});
