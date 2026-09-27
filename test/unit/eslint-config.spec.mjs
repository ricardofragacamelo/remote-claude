import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * The lint rules of docs/architecture/shared/09-code-quality.md, exercised against the real
 * configuration of the repository.
 *
 * A rule nobody tests is a rule that survives until someone edits the config by accident — and
 * these four are the ones the pre-commit hook leans on.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** @type {ESLint} */
let eslint;

// Resolving the flat configuration costs several seconds, and it happens on the **first** lint,
// not in the constructor — so without a warm-up here the first `it` pays for it and trips the
// default 5 s deadline. A test whose result depends on which one ran first is flaky by
// construction; see cycle 26 in docs/plans/00-bootstrap/progress.md.
vi.setConfig({ hookTimeout: 120_000 });

beforeAll(async () => {
  eslint = new ESLint({ cwd: repoRoot });
  await eslint.lintText('export const warmUp = 1;\n', {
    filePath: path.join(repoRoot, 'web/src/warm-up.ts'),
  });
});

/**
 * @param {string} code
 * @param {string} filePath repository-relative path the code pretends to live at
 * @returns {Promise<string[]>} rule IDs reported
 */
async function ruleIdsFor(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath: path.join(repoRoot, filePath) });
  return (result?.messages ?? []).map((message) => message.ruleId ?? 'fatal');
}

describe('no-console', () => {
  it('rejects a console statement in application code', async () => {
    const rules = await ruleIdsFor('export const x = () => console.log("hi");\n', 'web/src/x.ts');

    expect(rules).toContain('no-console');
  });

  it('rejects it in a script too — scripts print through scripts/lib/ui.mjs', async () => {
    const rules = await ruleIdsFor('console.log("hi");\n', 'scripts/x.mjs');

    expect(rules).toContain('no-console');
  });
});

describe('no-explicit-any', () => {
  it('rejects an explicit any', async () => {
    const rules = await ruleIdsFor('export const f = (x: any) => x;\n', 'backend/src/f.ts');

    expect(rules).toContain('@typescript-eslint/no-explicit-any');
  });

  it('accepts unknown, which is the way out', async () => {
    const rules = await ruleIdsFor('export const f = (x: unknown) => x;\n', 'backend/src/f.ts');

    expect(rules).toEqual([]);
  });
});

describe('ban-ts-comment', () => {
  it('rejects @ts-ignore, which would do nothing once the error is fixed', async () => {
    const code = ['// @ts-ignore', 'export const x = 1;', ''].join('\n');

    expect(await ruleIdsFor(code, 'backend/src/x.ts')).toContain(
      '@typescript-eslint/ban-ts-comment',
    );
  });

  it('accepts @ts-expect-error with a description', async () => {
    const code = [
      '// @ts-expect-error -- the SDK does not type this variant yet; see #142',
      'export const x: number = "1";',
      '',
    ].join('\n');

    expect(await ruleIdsFor(code, 'backend/src/x.ts')).toEqual([]);
  });

  it('rejects @ts-expect-error with no description', async () => {
    const code = ['// @ts-expect-error', 'export const x: number = "1";', ''].join('\n');

    expect(await ruleIdsFor(code, 'backend/src/x.ts')).toContain(
      '@typescript-eslint/ban-ts-comment',
    );
  });
});

describe('eslint-comments/require-description', () => {
  it('rejects a suppression with no reason', async () => {
    const code = ['// eslint-disable-next-line no-console', 'console.log("x");', ''].join('\n');

    expect(await ruleIdsFor(code, 'backend/src/x.ts')).toContain(
      '@eslint-community/eslint-comments/require-description',
    );
  });

  it('accepts a suppression that explains itself', async () => {
    const code = [
      '// eslint-disable-next-line no-console -- this file is the console writer itself',
      'console.log("x");',
      '',
    ].join('\n');

    expect(await ruleIdsFor(code, 'backend/src/x.ts')).toEqual([]);
  });
});

describe('tests outside src/', () => {
  it('rejects a spec file living inside src/', async () => {
    const rules = await ruleIdsFor('export const x = 1;\n', 'backend/src/thing.spec.ts');

    expect(rules).toContain('no-restricted-syntax');
  });

  it('accepts the same file under the mirrored test tree', async () => {
    const rules = await ruleIdsFor('export const x = 1;\n', 'backend/test/unit/thing.spec.ts');

    expect(rules).toEqual([]);
  });

  it('says where to move it', async () => {
    const [result] = await eslint.lintText('export const x = 1;\n', {
      filePath: path.join(repoRoot, 'web/src/feature/thing.test.ts'),
    });

    expect(result?.messages[0]?.message).toContain('test/unit');
  });
});

describe('react/jsx-no-literals — nothing presentable is born hardcoded', () => {
  // S-22 of plan 03: the screens where an authorisation is taken back are as bound by the rule as
  // any other, and a sentence written in English there is a sentence a pt-BR user cannot read.
  it.each([
    'web/src/features/permission/components/RuleList.tsx',
    'web/src/features/permission/components/RuleRow.tsx',
    'web/src/app/RulesRoute.tsx',
  ])('rejects a literal sentence in %s', async (filePath) => {
    const code = 'export const Row = () => <button>Revoke</button>;\n';

    expect(await ruleIdsFor(code, filePath)).toContain('react/jsx-no-literals');
  });

  it('accepts the same button when its text comes from a key', async () => {
    const code = "export const Row = ({ t }) => <button>{t('rules.action.revoke')}</button>;\n";

    expect(
      await ruleIdsFor(code, 'web/src/features/permission/components/RuleRow.tsx'),
    ).not.toContain('react/jsx-no-literals');
  });
});

describe('complexity — at most 10 paths through a function', () => {
  /**
   * A function whose cyclomatic complexity is exactly `paths`: one path, plus one per `if`.
   *
   * @param {number} paths
   * @returns {string}
   */
  function withPaths(paths) {
    const branches = Array.from(
      { length: paths - 1 },
      (_, index) => `  if (x === ${String(index)}) {\n    return ${String(index)};\n  }\n`,
    );

    return `export function f(x: number): number {\n${branches.join('')}  return -1;\n}\n`;
  }

  // S-62 — the bar is inclusive: ten passes, eleven does not.
  it('accepts a function with exactly 10 paths', async () => {
    expect(await ruleIdsFor(withPaths(10), 'backend/src/f.ts')).not.toContain('complexity');
  });

  it('rejects a function with 11', async () => {
    expect(await ruleIdsFor(withPaths(11), 'backend/src/f.ts')).toContain('complexity');
  });

  // S-63 — no scope of the repository escapes it, tests and scripts included.
  it.each([
    'backend/src/f.ts',
    'backend/test/unit/f.spec.ts',
    'web/src/features/session/hooks/f.ts',
    'packages/contracts/src/f.ts',
    'e2e/f.ts',
  ])('holds in %s', async (filePath) => {
    expect(await ruleIdsFor(withPaths(11), filePath)).toContain('complexity');
  });

  it('holds in a script, which is JavaScript', async () => {
    const code = withPaths(11).replace('(x: number): number', '(x)');

    expect(await ruleIdsFor(code, 'scripts/lib/f.mjs')).toContain('complexity');
  });
});
