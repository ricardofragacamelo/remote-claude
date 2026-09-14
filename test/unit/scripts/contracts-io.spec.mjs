import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  SCHEMA_DIR,
  drift,
  messageSchemas,
  targets,
  write,
} from '../../../scripts/lib/contracts-io.mjs';

/**
 * The portion of `pnpm contracts:check` that decides whether the committed files still match the
 * schema — the only thing standing between a schema change and a mobile build that breaks at
 * runtime, because nothing in TypeScript imports the generated Dart (risk R-04).
 */

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');

/** @type {string[]} */
const temporary = [];

afterEach(() => {
  for (const dir of temporary.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** A repository-shaped temporary tree with the real schemas copied into it. */
function scratchRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-contracts-'));
  temporary.push(root);
  fs.cpSync(path.join(repoRoot, SCHEMA_DIR), path.join(root, SCHEMA_DIR), { recursive: true });

  for (const target of targets(root)) {
    write(root, target);
  }

  return root;
}

/** @param {string} root @param {string} name */
function targetNamed(root, name) {
  const found = targets(root).find((target) => target.name === name);
  if (found === undefined) {
    throw new Error(`no ${name} target`);
  }
  return found;
}

describe('messageSchemas', () => {
  it('finds every message schema and leaves the envelope out of the list', () => {
    const found = messageSchemas(repoRoot);

    expect(found).toContain(`${SCHEMA_DIR}/commands/connection-authenticate.schema.json`);
    expect(found).toContain(`${SCHEMA_DIR}/acks/connection-ready.schema.json`);
    expect(found).not.toContain(`${SCHEMA_DIR}/envelope.schema.json`);
  });

  it('returns them sorted, so the generated output never depends on listing order', () => {
    const found = messageSchemas(repoRoot);

    expect(found).toEqual([...found].sort());
  });
});

describe('targets', () => {
  it('produces exactly the two committed files', () => {
    expect(targets(repoRoot).map((target) => target.file)).toEqual([
      'packages/contracts/src/protocol.ts',
      'mobile/lib/core/network/contracts/protocol.g.dart',
    ]);
  });

  it('is pure — the same schemas twice produce the same content', () => {
    expect(targets(repoRoot)).toEqual(targets(repoRoot));
  });
});

describe('drift', () => {
  it('reports nothing when both files match the schema', () => {
    const root = scratchRepo();

    for (const target of targets(root)) {
      expect(drift(root, target)).toBeNull();
    }
  });

  it('reports the TypeScript when the schema changed and it was not regenerated', () => {
    const root = scratchRepo();
    const before = targetNamed(root, 'TypeScript');

    const schema = path.join(root, SCHEMA_DIR, 'commands/connection-reauthenticate.schema.json');
    const parsed = JSON.parse(fs.readFileSync(schema, 'utf8'));
    parsed.properties['deviceId'] = { type: 'string' };
    fs.writeFileSync(schema, JSON.stringify(parsed, null, 2));

    expect(drift(root, targetNamed(root, 'TypeScript'))).toBe('is out of sync with the schema');
    expect(targetNamed(root, 'TypeScript').content).not.toBe(before.content);
  });

  it('reports the Dart too — nothing in TypeScript would ever notice it', () => {
    const root = scratchRepo();

    const schema = path.join(root, SCHEMA_DIR, 'commands/connection-reauthenticate.schema.json');
    const parsed = JSON.parse(fs.readFileSync(schema, 'utf8'));
    parsed.properties['deviceId'] = { type: 'string' };
    fs.writeFileSync(schema, JSON.stringify(parsed, null, 2));

    expect(drift(root, targetNamed(root, 'Dart'))).toBe('is out of sync with the schema');
  });

  it('reports a hand-edited generated file, not only a changed schema', () => {
    const root = scratchRepo();
    const target = targetNamed(root, 'TypeScript');
    fs.appendFileSync(path.join(root, target.file), '\nexport const sneaked = true;\n');

    expect(drift(root, target)).toBe('is out of sync with the schema');
  });

  it('reports a file that was never generated', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-contracts-'));
    temporary.push(root);
    fs.cpSync(path.join(repoRoot, SCHEMA_DIR), path.join(root, SCHEMA_DIR), { recursive: true });

    expect(drift(root, targetNamed(root, 'Dart'))).toBe('has never been generated');
  });
});

describe('write', () => {
  it('creates the file and its directory the first time', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-contracts-'));
    temporary.push(root);
    fs.cpSync(path.join(repoRoot, SCHEMA_DIR), path.join(root, SCHEMA_DIR), { recursive: true });

    const target = targetNamed(root, 'Dart');

    expect(write(root, target)).toBe(true);
    expect(fs.existsSync(path.join(root, target.file))).toBe(true);
  });

  it('is idempotent — a second generation changes nothing', () => {
    const root = scratchRepo();

    for (const target of targets(root)) {
      expect(write(root, target)).toBe(false);
    }
  });

  it('rewrites a file that drifted, and leaves it in sync', () => {
    const root = scratchRepo();
    const target = targetNamed(root, 'TypeScript');
    fs.writeFileSync(path.join(root, target.file), 'tampered');

    expect(write(root, target)).toBe(true);
    expect(drift(root, target)).toBeNull();
  });
});
