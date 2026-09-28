import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const WORKFLOWS = path.join(repoRoot, '.github', 'workflows');

/**
 * @typedef {{ run?: string, env?: Record<string, string> }} Step
 * @typedef {{ env?: Record<string, string>, steps: Step[] }} Job
 * @typedef {{ jobs: Record<string, Job>, on: Record<string, unknown> }} Workflow
 */

/** @type {{ file: string, flow: Workflow }[]} */
const workflows = fs
  .readdirSync(WORKFLOWS)
  .filter((file) => file.endsWith('.yml'))
  .map((file) => ({ file, flow: parse(fs.readFileSync(path.join(WORKFLOWS, file), 'utf8')) }));

/** @param {Workflow} flow */
const stepsOf = (flow) => Object.values(flow.jobs).flatMap((job) => job.steps);

/**
 * The CI side of plan 05 · B-19 and S-40.
 *
 * Two runs of the stack on one machine share nothing because `run-e2e-local.mjs` gives each one
 * random ports and a compose project it owns — proved in its own suites. What is proved here is
 * that no workflow undoes that by pinning either, and that the suite against the real Claude
 * stays out of CI, as D-12 of plan 01 decided and D-11 of plan 05 kept.
 */
describe('the workflows', () => {
  it('pin no compose project and no port of the stack, in any job of any workflow', () => {
    const variables = workflows.flatMap(({ flow }) =>
      Object.values(flow.jobs).flatMap((job) => [
        ...Object.keys(job.env ?? {}),
        ...job.steps.flatMap((step) => Object.keys(step.env ?? {})),
      ]),
    );

    for (const variable of variables) {
      expect(variable).not.toBe('COMPOSE_PROJECT_NAME');
      expect(variable).not.toMatch(/^RC_.*_PORT$/);
    }
  });

  it('never run the suite against the real Claude, which has no credential here', () => {
    const commands = workflows.flatMap(({ flow }) => stepsOf(flow).map((step) => step.run ?? ''));

    expect(commands.some((command) => /smoke-live|test:e2e:live/.test(command))).toBe(false);
  });

  it('hand no Claude credential to any step', () => {
    const variables = workflows.flatMap(({ flow }) =>
      stepsOf(flow).flatMap((step) => Object.keys(step.env ?? {})),
    );

    expect(variables).not.toContain('CLAUDE_CODE_OAUTH_TOKEN');
    expect(variables).not.toContain('ANTHROPIC_API_KEY');
  });
});
