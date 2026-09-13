import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  declaredVariables,
  findEnvReads,
  readVariables,
  undeclaredReads,
} from '../../scripts/lib/env-example.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Where application configuration is read. Scripts are excluded: they are not the product. */
const SOURCE_DIRS = ['backend/src', 'web/src', 'packages', 'e2e'];

describe('declaredVariables', () => {
  it('reads every declaration, ignoring comments and blank lines', () => {
    const content = ['# a comment', '', 'RC_WEB_PORT=5173', 'LOG_LEVEL=debug', ''].join('\n');

    expect([...declaredVariables(content)]).toEqual(['RC_WEB_PORT', 'LOG_LEVEL']);
  });

  it('does not take a commented-out declaration as a declaration', () => {
    expect([...declaredVariables('# RC_WEB_PORT=5173\n')]).toEqual([]);
  });

  it('accepts a quoted value', () => {
    expect([...declaredVariables('OIDC_SCOPES="openid profile"\n')]).toEqual(['OIDC_SCOPES']);
  });
});

describe('readVariables', () => {
  it('finds both access forms', () => {
    const code = 'const a = process.env.DATABASE_URL; const b = process.env["LOG_LEVEL"];';

    expect(readVariables(code).sort()).toEqual(['DATABASE_URL', 'LOG_LEVEL']);
  });

  it('reports a variable read twice only once', () => {
    expect(readVariables('process.env.NODE_ENV + process.env.NODE_ENV')).toEqual(['NODE_ENV']);
  });

  it('finds nothing in code that reads nothing', () => {
    expect(readVariables('const x = 1;')).toEqual([]);
  });
});

describe('undeclaredReads', () => {
  it('reports the variable the example file never mentions', () => {
    const missing = undeclaredReads(
      [
        { name: 'DATABASE_URL', file: 'backend/src/a.ts' },
        { name: 'SECRET_THING', file: 'backend/src/b.ts' },
      ],
      new Set(['DATABASE_URL']),
    );

    expect(missing).toEqual([{ name: 'SECRET_THING', file: 'backend/src/b.ts' }]);
  });
});

describe('.env.example', () => {
  const example = fs.readFileSync(path.join(repoRoot, '.env.example'), 'utf8');

  it('declares every variable the source code reads', () => {
    const missing = undeclaredReads(
      findEnvReads(repoRoot, SOURCE_DIRS),
      declaredVariables(example),
    );

    expect(missing).toEqual([]);
  });

  it('gives every variable a comment above it', () => {
    const lines = example.split('\n');
    /** @type {string[]} */
    const uncommented = [];

    lines.forEach((rawLine, index) => {
      if (declaredVariables(rawLine).size === 0) {
        return;
      }

      const above = lines
        .slice(0, index)
        .reverse()
        .find((previous) => previous.trim() !== '');

      if (above === undefined || !above.trimStart().startsWith('#')) {
        uncommented.push(rawLine.split('=')[0] ?? rawLine);
      }
    });

    expect(uncommented).toEqual([]);
  });

  it('carries no Claude credential — the backend inherits the local login', () => {
    const suspicious = [...declaredVariables(example)].filter(
      (name) => name.includes('CLAUDE') || name.includes('ANTHROPIC'),
    );

    expect(suspicious).toEqual([]);
  });
});
