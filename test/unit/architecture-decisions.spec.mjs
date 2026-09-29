import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { linksOf, slugify } from '../../scripts/lib/markdown.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** @param {string} relative */
function read(relative) {
  return fs.readFileSync(path.join(repoRoot, relative), 'utf8');
}

const DECISIONS = 'docs/architecture/shared/00-decisions.md';
const ADR_014 = 'ADR-014 — O web vira um workbench, construído em React';

/**
 * The body of one ADR: from its heading to the next one of the same level.
 *
 * @param {string} heading
 */
function section(heading) {
  const content = read(DECISIONS);
  const start = content.indexOf(`## ${heading}\n`);

  if (start === -1) {
    throw new Error(`${DECISIONS} has no "## ${heading}"`);
  }

  const next = content.indexOf('\n## ', start + 1);

  return content.slice(start, next === -1 ? undefined : next);
}

/**
 * A decision is "cited with its result" when the ADR links to it and the same line carries a date
 * — the day it was decided — beside the link.
 *
 * @param {string} body
 * @param {string} decision `D-01`
 */
function citesWithResult(body, decision) {
  return body
    .split('\n')
    .some(
      (line) =>
        line.includes(`06 · ${decision}`) &&
        line.includes('plans/06-workbench/decisions.md') &&
        /\b2026-\d{2}-\d{2}\b/.test(line),
    );
}

/**
 * Whether a document links to ADR-014, by its anchor. The anchor is the one the heading produces,
 * so renaming the ADR without fixing the links fails here as well as in `docs:check`.
 *
 * @param {string} relative
 */
function linksToAdr014(relative) {
  const anchor = `00-decisions.md#${slugify(ADR_014)}`;

  return linksOf(read(relative)).some((link) => link.target.endsWith(anchor));
}

// Plan 06, S-165: the workbench was decided, and documented, before a line of it was written.
describe('ADR-014 — the web becomes a workbench', () => {
  const body = section(ADR_014);

  it('is accepted, and says which plan completed it', () => {
    expect(body).toMatch(/\*\*Status:\*\* aceita/);
    expect(body).toContain('plans/06-workbench/F0-contract.md#b-01');
  });

  it('names the alternative it discarded, and why — the permission and the trail', () => {
    expect(body).toMatch(/\*\*A alternativa descartada/);
    expect(body).toContain('openvscode-server');
    expect(body).toContain('code-server');
    expect(body).toContain('`canUseTool`');
    expect(body).toContain('`PreToolUse`');
  });

  it.each(['D-01', 'D-08', 'D-10'])('cites %s with the result it had', (decision) => {
    expect(citesWithResult(body, decision)).toBe(true);
  });

  it('keeps the app settings and the Claude configuration apart, in words', () => {
    expect(body).toMatch(/Configurações do app\s+e configuração do Claude nunca dividem uma tela/);
  });
});

describe('the documents that follow from ADR-014 point back to it', () => {
  it.each([
    'docs/architecture/web/02-folder-structure.md',
    'docs/architecture/web/03-ui-system.md',
    'docs/architecture/web/04-state-and-data.md',
    'docs/architecture/backend/03-modules.md',
  ])('%s links to the ADR', (relative) => {
    expect(linksToAdr014(relative)).toBe(true);
  });
});
