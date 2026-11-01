import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { callApi } from '../fixtures/api';
import { closedAfterTheRun, connected, startSession, workspaceFor } from '../fixtures/live-session';
import {
  answeredUntilTheTurnEnds,
  endedWithEveryMessageKnown,
  saidIn,
} from '../fixtures/live-turns';
import { scenario } from '../scenarios';

/**
 * 13·S-197 — what only an isolated `CLAUDE_CONFIG_DIR` confirms, and the other `smoke-live` specs
 * cannot without breaking: a user skill of that configuration loads through the synthetic plugin
 * (B-35), its permissive `settings.json` `allow` never dispenses `canUseTool` — `settingSources:
 * ['project']` ignores the user scope regardless of what it allows, the same fact the B-01 spike
 * measured — and a project skill's inline shell block never runs (D-21/D-24).
 *
 * Runs under the `smoke-live-isolated` Playwright project alone, against the throwaway
 * `CLAUDE_CONFIG_DIR` `scripts/run-e2e-local.mjs --live-isolated` builds before the backend comes
 * up — never the developer's own. The other `smoke-live` specs ([claude-panel.spec.ts
 * ](claude-panel.spec.ts), [claude-settings.spec.ts](claude-settings.spec.ts)) deliberately run
 * against the real one, so this is a project, not a flag, of its own.
 */

const live = scenario('live-claude-settings-isolated');
const expected = live.expect as {
  userSkillName: string;
  userSkillInstruction: string;
  userSkillMarker: string;
  writeInstruction: string;
  writtenFile: string;
  projectSkillName: string;
  projectSkillFile: string;
  shellInstruction: string;
  shellMarkerFile: string;
};

const context = workspaceFor(live.user);

/** A folder made for this run alone, gone at the end. */
function throwawayFolder(root: string): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(root, 'rc-settings-isolated-')));
}

/** The skills of [folder], as the Skills screen itself reads them. */
async function skillsOf(
  folder: string,
): Promise<readonly { name: string; origin: string; enabled: boolean }[]> {
  const response = await callApi(
    context().user,
    `/engines/claude/skills?folder=${encodeURIComponent(folder)}`,
  );
  expect(response.status).toBe(200);
  const { skills } = (await response.json()) as {
    skills: readonly { name: string; origin: string; enabled: boolean }[];
  };
  return skills;
}

test(`${live.id} — the real Claude, isolated: a user skill loads, its allow never dispenses canUseTool, and a project skill's shell block never runs`, async () => {
  const folder = throwawayFolder(context().workspace);
  fs.mkdirSync(path.join(folder, '.claude', 'skills', expected.projectSkillName), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(folder, '.claude', 'skills', expected.projectSkillName, 'SKILL.md'),
    expected.projectSkillFile,
  );

  const socket = await connected(context().user);

  try {
    // S-197 — before any session is live for this folder, GET /engines/claude/skills falls back to
    // the ephemeral installation probe (ClaudeInstallationCatalog.of()) rather than a live session's
    // own answer — and that probe's query carries no `plugins` at all (openEphemeralQuery never
    // composes them), so it cannot yet see a skill the synthetic plugin would bring in. Measured
    // here, not asserted: a real gap found by this very scenario, outside what B-46 scoped to fix.
    const before = await skillsOf(folder);
    if (before.find((skill) => skill.name === expected.userSkillName)?.origin !== 'user') {
      test.info().annotations.push({
        type: 'warning',
        description:
          'GET /engines/claude/skills answers with no user-origin skill before any session is ' +
          "live for the folder — the installation probe's query carries no plugins, so it never " +
          'sees the synthetic plugin (backend/src/adapter/outbound/engines/claude/' +
          'ephemeral-query.ts). Found while writing 13·S-197, out of its own scope to fix.',
      });
    }

    // S-197 — the user origin is off until asked for, the safety default of D-20: nobody's own
    // skills load by surprise. The same toggle the Skills screen's "Your own skills" switch sends.
    const turnedOn = await callApi(context().user, '/engines/claude/skills/preferences', {
      method: 'PUT',
      body: { folder: null, sources: { user: true }, disabledSkills: [] },
    });
    expect(turnedOn.status).toBe(200);

    const sessionId = await startSession(socket, folder);

    // S-197 — with a session live for the folder, the same route now answers from it
    // (ClaudeInstallationCatalog.of()'s own first check) rather than the plugin-less probe, and a
    // real interactive session's own composition (session-runner.ts) does carry the synthetic
    // plugin — the screen's own "User" badge, confirmed once there is something for it to read.
    const skills = await skillsOf(folder);
    const userSkill = skills.find((skill) => skill.name === expected.userSkillName);
    expect(userSkill?.origin).toBe('user');
    expect(userSkill?.enabled).toBe(true);

    // S-197 — the user skill does not just appear on the screen: it runs. Its own body replies
    // with a marker no other skill or prompt of this run says, so the model actually reaching it
    // through the Skill tool is unambiguous.
    const skillMark = socket.frames.length;
    socket.send('session.prompt', { sessionId, text: expected.userSkillInstruction });
    const skillTurn = await answeredUntilTheTurnEnds(
      socket,
      () => true,
      'smoke-live allows whatever this turn asks for',
      skillMark,
    );
    expect(saidIn(skillTurn.frames)).toContain(expected.userSkillMarker);

    // S-197 — the isolated settings.json's own `permissions.allow` (Bash(*), Write, Edit) never
    // dispenses canUseTool: settingSources: ['project'] ignores the user scope regardless of what
    // it allows, so the write is still asked about — a real assertion, not a measured annotation,
    // since the opposite would be the exact regression this scenario exists to catch.
    const writtenPath = path.join(folder, expected.writtenFile);
    const writeMark = socket.frames.length;
    socket.send('session.prompt', { sessionId, text: expected.writeInstruction });
    const write = await answeredUntilTheTurnEnds(
      socket,
      () => true,
      'smoke-live allows the one write this turn asks for',
      writeMark,
    );
    expect(write.asked.some((call) => call.startsWith('Write:'))).toBe(true);
    expect(fs.existsSync(writtenPath)).toBe(true);

    // S-197 — a project skill's own `!` block never runs (D-21/D-24): the marker is never created,
    // even though the skill itself ran (it still replies "done").
    const markerPath = path.join(folder, expected.shellMarkerFile);
    const shellMark = socket.frames.length;
    socket.send('session.prompt', { sessionId, text: expected.shellInstruction });
    await answeredUntilTheTurnEnds(
      socket,
      () => true,
      'smoke-live allows whatever this turn asks for',
      shellMark,
    );
    expect(fs.existsSync(markerPath)).toBe(false);

    await endedWithEveryMessageKnown(socket, sessionId);
  } finally {
    closedAfterTheRun(socket, folder);
  }
});
