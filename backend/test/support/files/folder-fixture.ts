import { execFileSync } from 'node:child_process';
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** UTF-16 of a text, with the mark of its byte order. */
function utf16(text: string, order: 'le' | 'be'): Buffer {
  const little = Buffer.from(text, 'utf16le');
  const body = order === 'le' ? little : Buffer.from(little).swap16();

  return Buffer.concat([Buffer.from(order === 'le' ? [0xff, 0xfe] : [0xfe, 0xff]), body]);
}

/** What the fixture planted, by role. */
export interface FolderFixture {
  /** The open folder — a subfolder of the root of the allowlist, so climbing out stays inside it. */
  readonly folder: string;
  /** A folder beside it, inside the same root and outside the open folder. */
  readonly outside: string;
}

/**
 * A folder with one of everything the explorer meets: text in every encoding the server knows,
 * a binary, links that stay and links that leave, a loop, a FIFO, hidden names and a name that is
 * not UTF-8.
 *
 * Under the root of the allowlist, as `project/`, with `outside/` beside it: a path that climbs out
 * of the open folder lands inside the same root, which is exactly what the fence of plan 07 refuses
 * anyway (D-11).
 */
export function plantFolder(root: string): FolderFixture {
  const folder = path.join(root, 'project');
  const outside = path.join(root, 'outside');
  const at = (...segments: string[]): string => path.join(folder, ...segments);

  for (const directory of ['src', 'docs', 'empty', '.git', 'nested/deep']) {
    mkdirSync(at(directory), { recursive: true });
  }
  mkdirSync(outside, { recursive: true });

  writeFileSync(path.join(outside, 'secret.txt'), 'outside the open folder\n');
  writeFileSync(at('src', 'a.ts'), 'export const a = 1;\n');
  writeFileSync(at('src', 'B.ts'), 'export const b = 2;\n');
  writeFileSync(at('src', 'item10.ts'), '');
  writeFileSync(at('src', 'item2.ts'), '');
  writeFileSync(at('docs', 'guide.md'), '# Guide\n');
  writeFileSync(at('nested', 'deep', 'leaf.txt'), 'leaf\n');
  writeFileSync(at('readme.md'), '# Project\n');
  writeFileSync(at('.DS_Store'), 'x');
  writeFileSync(at('empty.txt'), '');
  writeFileSync(at('crlf.txt'), 'one\r\ntwo\r\n');
  writeFileSync(at('mixed.txt'), 'one\r\ntwo\n');
  writeFileSync(
    at('bom.txt'),
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('com marca\n')]),
  );
  writeFileSync(at('utf16le.txt'), utf16('olá\n', 'le'));
  writeFileSync(at('utf16be.txt'), utf16('olá\n', 'be'));
  // "ação" in windows-1252: valid there, invalid as UTF-8.
  writeFileSync(at('latin1.txt'), Buffer.from([0x61, 0xe7, 0xe3, 0x6f]));
  writeFileSync(at('binary.bin'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]));
  writeFileSync(at('açaí café.md'), 'unicode\n');
  writeFileSync(Buffer.from(`${folder}/n\xffo`, 'latin1'), 'not utf-8\n');
  writeFileSync(at('script.sh'), '#!/bin/sh\necho hi\n', { mode: 0o755 });

  symlinkSync(at('src', 'a.ts'), at('link-inside.ts'));
  symlinkSync(at('src'), at('link-to-src'));
  symlinkSync(path.join(outside, 'secret.txt'), at('link-outside.txt'));
  symlinkSync(outside, at('escape'));
  symlinkSync(at('nowhere'), at('broken'));
  symlinkSync(at('loop-b'), at('loop-a'));
  symlinkSync(at('loop-a'), at('loop-b'));
  execFileSync('mkfifo', [at('pipe')]);

  return { folder, outside };
}
