import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { NodeFolderDisk } from '@adapter/outbound/filesystem/node-folder-disk';
import { FilesModuleReferenceInspector } from '@adapter/outbound/session/files-module-reference.inspector';
import { FileNotFoundError, FileNotTextError, InvalidFilePathError } from '@domain/files';
import { ReferenceKindMismatchError } from '@domain/session';
import { WorkspaceNotAllowedError, WorkspacePath } from '@domain/workspace';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

/** The references of a prompt against a real disk — plan 08, B-44. */
describe('FilesModuleReferenceInspector', () => {
  let base: string;
  let folder: WorkspacePath;
  let inspector: FilesModuleReferenceInspector;

  beforeEach(() => {
    base = realpathSync(mkdtempSync(path.join(tmpdir(), 'rc-reference-')));
    const root = path.join(base, 'app');
    mkdirSync(path.join(root, 'src'), { recursive: true });
    writeFileSync(path.join(root, 'src', 'a.ts'), 'export const a = 1;\n');
    writeFileSync(path.join(root, 'shot.png'), PNG);
    writeFileSync(path.join(root, 'doc.pdf'), '%PDF-1.4\n');
    writeFileSync(path.join(base, 'outside.txt'), 'not yours');
    symlinkSync(path.join(base, 'outside.txt'), path.join(root, 'out.txt'));
    symlinkSync(path.join(root, 'src', 'a.ts'), path.join(root, 'in.ts'));
    folder = WorkspacePath.create(root);
    inspector = new FilesModuleReferenceInspector(new NodeFolderDisk(new RecordingLogger().logger));
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  it('measures a text file, by a relative or an absolute path', async () => {
    expect(await inspector.inspect(folder, 'src/a.ts', 'file')).toEqual({
      relative: 'src/a.ts',
      size: 20,
    });
    expect(await inspector.inspect(folder, path.join(folder.value, 'src/a.ts'), 'file')).toEqual({
      relative: 'src/a.ts',
      size: 20,
    });
  });

  it('takes an image, which Read reads', async () => {
    expect((await inspector.inspect(folder, 'shot.png', 'file')).size).toBe(PNG.length);
  });

  it('takes a link that stays inside', async () => {
    expect((await inspector.inspect(folder, 'in.ts', 'file')).relative).toBe('in.ts');
  });

  it('takes a folder, and the folder itself by its absolute path, without adding up its size', async () => {
    expect(await inspector.inspect(folder, 'src', 'folder')).toEqual({ relative: 'src', size: 0 });
    expect(await inspector.inspect(folder, folder.value, 'folder')).toEqual({
      relative: '',
      size: 0,
    });
    expect(await inspector.inspect(folder, `${folder.value}/`, 'folder')).toEqual({
      relative: '',
      size: 0,
    });
  });

  it.each([
    ['a path that climbs out', '../outside.txt', WorkspaceNotAllowedError],
    ['an absolute path elsewhere', '/etc/hostname', WorkspaceNotAllowedError],
    ['a link that leads out — S-200', 'out.txt', WorkspaceNotAllowedError],
    ['nothing there — S-201', 'src/gone.ts', FileNotFoundError],
    ['a PDF, which is not text — S-201', 'doc.pdf', FileNotTextError],
    ['a backslash', 'src\\a.ts', InvalidFilePathError],
  ])('refuses %s', async (_case, raw, error) => {
    await expect(inspector.inspect(folder, raw, 'file')).rejects.toBeInstanceOf(error);
  });

  it('refuses a folder named as a file, and a file named as a folder — S-201', async () => {
    await expect(inspector.inspect(folder, 'src', 'file')).rejects.toBeInstanceOf(
      ReferenceKindMismatchError,
    );
    await expect(inspector.inspect(folder, 'src/a.ts', 'folder')).rejects.toBeInstanceOf(
      ReferenceKindMismatchError,
    );
  });

  it('refuses a folder that is not there', async () => {
    await expect(inspector.inspect(folder, 'gone', 'folder')).rejects.toBeInstanceOf(
      FileNotFoundError,
    );
  });

  it('cuts an absolute path from the root of the machine, when the folder is the root', async () => {
    const inside = path.join(folder.value, 'src', 'a.ts');

    expect(await inspector.inspect(WorkspacePath.create('/'), inside, 'file')).toEqual({
      relative: inside.slice(1),
      size: 20,
    });
  });

  it('says the folder itself is `.` when it is refused', async () => {
    await expect(inspector.inspect(folder, '', 'file')).rejects.toMatchObject({
      params: { path: '.', kind: 'file' },
    });
  });
});
