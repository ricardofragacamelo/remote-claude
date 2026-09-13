import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * The strictness of docs/architecture/shared/09-code-quality.md is described there as
 * non-negotiable. This is what makes that true: loosening a flag breaks the suite, so it has to
 * be a deliberate decision with an ADR behind it, not a quiet edit.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * @param {string} relativePath
 * @returns {Record<string, unknown>}
 */
function compilerOptionsOf(relativePath) {
  const file = path.join(repoRoot, relativePath);
  const read = ts.readConfigFile(file, ts.sys.readFile);

  expect(read.error).toBeUndefined();

  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(file));

  return /** @type {Record<string, unknown>} */ (parsed.options);
}

describe('tsconfig.base.json', () => {
  const options = compilerOptionsOf('tsconfig.base.json');

  it.each([
    'strict',
    'noUncheckedIndexedAccess',
    'noImplicitOverride',
    'noFallthroughCasesInSwitch',
    'noUnusedLocals',
    'noUnusedParameters',
    'exactOptionalPropertyTypes',
    'verbatimModuleSyntax',
  ])('keeps %s on', (flag) => {
    expect(options[flag]).toBe(true);
  });

  it('declares the path aliases of the backend and of the web', () => {
    const paths = /** @type {Record<string, string[]>} */ (options['paths'] ?? {});

    expect(Object.keys(paths)).toEqual(
      expect.arrayContaining([
        '@domain/*',
        '@application/*',
        '@adapter/*',
        '@infra/*',
        '@shared/*',
        '@/*',
        '@/features/*',
        '@contracts',
      ]),
    );
  });
});

describe('scripts/tsconfig.json', () => {
  const options = compilerOptionsOf('scripts/tsconfig.json');

  it('type-checks the .mjs scripts through JSDoc, without a build step', () => {
    expect(options['allowJs']).toBe(true);
    expect(options['checkJs']).toBe(true);
    expect(options['noEmit']).toBe(true);
  });

  it('inherits the strictness instead of restating it', () => {
    expect(options['strict']).toBe(true);
    expect(options['exactOptionalPropertyTypes']).toBe(true);
  });
});
