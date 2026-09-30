import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import * as workspace from '@/features/workspace';

const SRC = path.resolve(import.meta.dirname, '../../../src');

/** Every source file of the web, as text. */
function sources(dir = SRC): { file: string; text: string }[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return /\.(ts|tsx)$/.test(entry.name)
      ? [{ file: full, text: fs.readFileSync(full, 'utf8') }]
      : [];
  });
}

/**
 * The store of "the selected workspace" is what sent a session to the first root instead of the folder
 * somebody picked — the case that started plan 06. It is gone, and this keeps it gone (S-149).
 */
describe('the global store of the selected workspace — plan 06, S-149', () => {
  it('is not exported by the workspace feature', () => {
    expect(Object.keys(workspace).filter((name) => /WorkspaceStore|selected/i.test(name))).toEqual(
      [],
    );
  });

  it('has no file, and no source names it', () => {
    expect(fs.existsSync(path.join(SRC, 'features/workspace/store/workspace.store.ts'))).toBe(
      false,
    );
    expect(
      sources()
        .filter(({ text }) => /useWorkspaceStore|WorkspaceSelector/.test(text))
        .map(({ file }) => path.relative(SRC, file)),
    ).toEqual([]);
  });

  it('leaves the home without the ping and the devices, which have screens of their own', () => {
    const home = fs.readFileSync(path.join(SRC, 'app/App.tsx'), 'utf8');

    expect(home).not.toMatch(/PingPanel|DeviceList|SessionStarter/);
  });
});

describe('the ways to the removed routes — plan 06, D-07, S-150', () => {
  it('are named by no source: no link, no navigation, no command', () => {
    expect(
      sources()
        .filter(({ text }) => /\b(to|href)\s*[:=]\s*['"`]\/(sessions|history)\b/.test(text))
        .map(({ file }) => path.relative(SRC, file)),
    ).toEqual([]);
  });
});
