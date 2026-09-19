import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { clearTrustMark, configFile } from '@adapter/outbound/claude/trusted-directory';

const DIRECTORY = '/srv/projects/app';

/**
 * The trust mark, against a real file.
 *
 * A real file because the thing being checked is a read, an edit and an atomic rename over
 * somebody's configuration — and a stubbed `fs` would test the stub.
 */
describe('clearTrustMark', () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(path.join(tmpdir(), 'rc-trust-'));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  const write = (config: unknown): void => {
    writeFileSync(configFile(home, ''), JSON.stringify(config), 'utf8');
  };

  const read = (): Record<string, unknown> =>
    JSON.parse(readFileSync(configFile(home, ''), 'utf8')) as Record<string, unknown>;

  it('reads the file the CLI reads when the config directory is isolated', () => {
    // `CLAUDE_CONFIG_DIR` wins, because that is what the CLI itself does. Clearing a mark in the
    // home file while the CLI reads another one looks exactly like clearing it, and is not.
    const isolated = mkdtempSync(path.join(tmpdir(), 'rc-config-'));

    expect(configFile(home, isolated)).toBe(path.join(isolated, '.claude.json'));
    expect(configFile(home, '')).toBe(path.join(home, '.claude.json'));

    rmSync(isolated, { recursive: true, force: true });
  });

  it('clears the mark of a trusted directory', () => {
    // Measured on 2026-09-18: with the mark set, the tool ran and `canUseTool` was never called.
    // Without this step the product has no human approval at all.
    write({ projects: { [DIRECTORY]: { hasTrustDialogAccepted: true } } });

    expect(clearTrustMark(DIRECTORY, home)).toBe('cleared');
    expect(read()).toEqual({ projects: { [DIRECTORY]: { hasTrustDialogAccepted: false } } });
  });

  it('keeps everything else in the file exactly as it was', () => {
    write({
      numStartups: 7,
      projects: {
        [DIRECTORY]: { hasTrustDialogAccepted: true, history: ['a'] },
        '/other': { hasTrustDialogAccepted: true },
      },
    });

    clearTrustMark(DIRECTORY, home);

    const config = read();
    expect(config['numStartups']).toBe(7);
    expect(config['projects']).toMatchObject({
      [DIRECTORY]: { history: ['a'] },
      // Another directory's mark is not ours to touch: it belongs to the user's own CLI.
      '/other': { hasTrustDialogAccepted: true },
    });
  });

  it('reports a directory that was not trusted, and writes nothing', () => {
    write({ projects: { [DIRECTORY]: { hasTrustDialogAccepted: false } } });

    expect(clearTrustMark(DIRECTORY, home)).toBe('notTrusted');
  });

  it('reports a directory the file has never heard of', () => {
    write({ projects: {} });

    expect(clearTrustMark(DIRECTORY, home)).toBe('notTrusted');
  });

  it('reports a file with no projects at all', () => {
    write({ numStartups: 1 });

    expect(clearTrustMark(DIRECTORY, home)).toBe('notTrusted');
  });

  it('reports a missing configuration instead of creating one', () => {
    // Inventing the file here would overwrite whatever the user's own CLI is about to write.
    expect(clearTrustMark(DIRECTORY, home)).toBe('noConfig');
  });

  it('reports a configuration it cannot parse, and leaves it alone', () => {
    writeFileSync(configFile(home, ''), '{ not json', 'utf8');

    expect(clearTrustMark(DIRECTORY, home)).toBe('noConfig');
    expect(readFileSync(configFile(home, ''), 'utf8')).toBe('{ not json');
  });

  it('leaves no temporary file behind', () => {
    write({ projects: { [DIRECTORY]: { hasTrustDialogAccepted: true } } });

    clearTrustMark(DIRECTORY, home);

    // A rename is atomic, so a reader sees the old file or the new one — never a half-written
    // one, and never a stray sibling.
    expect(() =>
      readFileSync(`${configFile(home, '')}.remote-claude.${String(process.pid)}`),
    ).toThrow();
  });
});
