import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

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

beforeAll(() => {
  eslint = new ESLint({ cwd: repoRoot });
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
