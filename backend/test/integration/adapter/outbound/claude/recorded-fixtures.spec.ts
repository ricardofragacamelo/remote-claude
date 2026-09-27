import { readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import * as prettier from 'prettier';
import { describe, expect, it } from 'vitest';

import { SessionRunner } from '@adapter/outbound/claude/session-runner';
import { SessionId } from '@domain/session';
import { WorkspacePath } from '@domain/workspace';
import { loadFixture } from '../../../../fakes/agent-sdk/fixture';
import { scriptedSdk } from '../../../../fakes/agent-sdk/scripted-query';
import { aConversation } from '../../../../support/builders/session.builder';
import { FixedClock } from '../../../../support/fakes/fixed-clock';
import { ManualScheduler } from '../../../../support/fakes/manual-scheduler';
import { RecordingJournal } from '../../../../support/fakes/recording-journal';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';
import { StubPermissionGate } from '../../../../support/fakes/stub-permission-gate';

const DIRECTORY = path.join(import.meta.dirname, '../../../../fakes/agent-sdk/fixtures');

/** The recordings of a turn that used tools — the ones the asymmetry is about. */
const TOOL_TURNS = ['tool-turn', 'init-turn'];

/** How many `tool_use` blocks the model emitted in a recording. */
function toolUsesIn(name: string): number {
  return loadFixture(name).messages.reduce(
    (count, message) =>
      message.type === 'assistant' && Array.isArray(message.message.content)
        ? count + message.message.content.filter((block) => block.type === 'tool_use').length
        : count,
    0,
  );
}

/**
 * The fake, confronted with what it replays — plan 01, S-89 and S-90, rewritten in plan 04.
 *
 * As first written, S-89 asked that re-recording a script produce the same file, and S-90 that the
 * recording show `6 tool calls → 6 hooks → 2 canUseTool`. Neither could hold: the model does not
 * repeat a stream, and a different prompt gives different numbers. What the suite depends on is
 * narrower and testable — that a recording is stable in its **form**, and that the replay keeps the
 * **asymmetry** the audit trail rests on ([ADR-011](../../../../../../docs/architecture/shared/00-decisions.md)).
 * Writing S-90 as a test found the replay asking `canUseTool` about every invocation of a tool the
 * recording had asked about once; the fake now matches each consultation to its invocation.
 */
describe('the recorded fixtures of the Agent SDK', () => {
  describe('their form — S-89', () => {
    const files = readdirSync(DIRECTORY).filter((file) => file.endsWith('.json'));

    it.each(files)('%s is written the way gate 1 expects', async (file) => {
      const full = path.join(DIRECTORY, file);
      const options = (await prettier.resolveConfig(full)) ?? {};

      expect(await prettier.check(readFileSync(full, 'utf8'), { ...options, filepath: full })).toBe(
        true,
      );
    });

    it.each(files)(
      '%s carries neither the throwaway directory nor the home of the machine',
      (file) => {
        const text = readFileSync(path.join(DIRECTORY, file), 'utf8');

        // As a path and as the slug the CLI names its project folders with. A fragment of the path
        // inside a streamed delta is cut wherever the model's tokens fell, and is left as it is.
        expect(text).not.toMatch(/\/tmp\/rc-fixture-[A-Za-z0-9]{6}/);
        expect(text).not.toMatch(/-tmp-rc-fixture-[A-Za-z0-9]{6}/);
        expect(text).not.toContain(homedir());
      },
    );
  });

  describe('the asymmetry they carry — S-90', () => {
    it.each(TOOL_TURNS)(
      '%s: every tool reached the hook, and only some reached canUseTool',
      (name) => {
        const fixture = loadFixture(name);

        expect(fixture.preToolUse).toHaveLength(toolUsesIn(name));
        expect(fixture.canUseTool.length).toBeGreaterThan(0);
        expect(fixture.canUseTool.length).toBeLessThan(fixture.preToolUse.length);
      },
    );

    it.each(TOOL_TURNS)(
      '%s: the replay fires and asks exactly what the recording did',
      async (name) => {
        const fixture = loadFixture(name);
        const { createQuery, record } = scriptedSdk({ fixture: name });
        const runner = new SessionRunner(
          {
            sessionId: SessionId.create('01J0ABCDEFGHJKMNPQRSTVWXYZ'),
            workspace: WorkspacePath.create('/srv/projects/app'),
            model: null,
            permissionMode: 'default',
            conversation: aConversation(),
            onEvent: () => undefined,
            onClosed: () => undefined,
          },
          {
            createQuery,
            recorder: { record: () => Promise.resolve() },
            journal: new RecordingJournal(),
            permissions: new StubPermissionGate(),
            limits: { maxBudgetUsd: 10, maxTurns: 100 },
            clock: new FixedClock(new Date('2026-09-26T12:00:00.000Z')),
            scheduler: new ManualScheduler(),
            bundledCliVersion: fixture.sdkVersion,
            logger: new RecordingLogger().logger,
          },
        );

        runner.run();
        runner.prompt(fixture.prompt);
        for (
          let turn = 0;
          turn < 5_000 && record.completed.length < fixture.preToolUse.length;
          turn += 1
        ) {
          await Promise.resolve();
        }
        await runner.close();

        expect(record.hooked).toEqual(fixture.preToolUse.map((entry) => entry.toolName));
        expect(record.asked).toEqual(fixture.canUseTool.map((entry) => entry.toolName));
      },
    );
  });
});
