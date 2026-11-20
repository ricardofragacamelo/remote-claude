import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { test } from '@playwright/test';

/**
 * A folder of hostile names and shapes, generated once per test — plan 11, B-21.
 *
 * Every name here is something that has broken a naive shell pipeline before: one that reads as
 * a flag, one with a space or a quote a shell would split on, one no filesystem call can even
 * address without a `Buffer`. The backend already builds every `rg` argv with a `--` separator and
 * an explicit `.` path (`search-text-argv.ts`), so none of this is expected to *break* anything —
 * the fixture exists to prove that end to end, not to find a new hole.
 *
 * Generated under the allowlist's own e2e root (the same root {@link folderTrees} uses, D-07 of
 * plan 04) and removed in `afterEach` — never a fixed directory, never the product's own repo.
 */

/** Every hostile file's own content carries this, so a search for it is unambiguous. */
export const HOSTILE_NEEDLE = 'hostile-needle-e2e';

/** One line of a hostile file's content, the needle plus whatever comes after it. */
function needleLine(suffix = ''): string {
  return `${HOSTILE_NEEDLE}${suffix}\n`;
}

/** One hostile tree, every one of its own files and folders as an absolute path. */
export interface HostileTree {
  readonly base: string;

  /** Names a shell would read as its own flags, had any of this ever reached an argv unguarded. */
  readonly dash: string;
  readonly dashLongOutput: string;
  readonly dashPreSh: string;

  readonly withSpace: string;
  readonly withQuote: string;
  readonly withStar: string;
  readonly withNewline: string;

  /** The same visible name, two different byte sequences — composed vs. decomposed Unicode. */
  readonly nfc: string;
  readonly nfd: string;

  /** Not a `string`: its own bytes are not valid UTF-8, so no JS string can hold them losslessly. */
  readonly nonUtf8: Buffer;

  readonly gitignore: string;
  /** Inside `ignored/`, named by `.gitignore` — out of a search that honors ignore files, in otherwise. */
  readonly ignoredFile: string;
  /** Inside `.git/` — out of **every** search, the one exclusion D-03 never lets a toggle undo. */
  readonly gitDirFile: string;

  /** A symlink leaving the tree entirely — never followed, `rg`'s own default (no `--follow`). */
  readonly escape: string;

  readonly binary: string;
  /** Past `RC_SEARCH_MAX_FILE_BYTES` — skipped whole, not searched short (ADR-016). */
  readonly overCeiling: string;
  /** One line far past the usual width, to prove a preview crops it (B-10, S-66) instead of failing. */
  readonly giantLine: string;
  readonly crlf: string;
  readonly bom: string;

  /** Never created by the fixture — exists only once a hostile pattern or replacement has actually run a command. */
  readonly sentinel: string;
}

/**
 * Makes one hostile tree under `root`, and removes it after the test.
 *
 * Registers its own `afterEach`, so it is called once at the top level of a spec (mirrors
 * `folderTrees`'s own shape, `fixtures/folder-tree.ts`).
 *
 * @returns a function that makes one tree, under the root given
 */
export function hostileFixture(): (root: string) => HostileTree {
  const made: string[] = [];

  test.afterEach(() => {
    for (const folder of made.splice(0)) {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  return (root) => {
    const base = path.join(root, `e2e-hostile-${randomUUID()}`);
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-e2e-hostile-outside-'));
    made.push(base, outside);
    fs.mkdirSync(base, { recursive: true });

    const dash = path.join(base, '-rf');
    const dashLongOutput = path.join(base, '--output=x');
    const dashPreSh = path.join(base, '--pre=sh');
    const withSpace = path.join(base, 'has space.txt');
    const withQuote = path.join(base, 'has"quote.txt');
    const withStar = path.join(base, 'has*star.txt');
    const withNewline = path.join(base, 'has\nnewline.txt');
    const nfc = path.join(base, 'café-nfc.txt'.normalize('NFC'));
    const nfd = path.join(base, 'café-nfd.txt'.normalize('NFD'));

    for (const file of [
      dash,
      dashLongOutput,
      dashPreSh,
      withSpace,
      withQuote,
      withStar,
      withNewline,
      nfc,
      nfd,
    ]) {
      fs.writeFileSync(file, needleLine());
    }

    const gitignore = path.join(base, '.gitignore');
    fs.writeFileSync(gitignore, 'ignored/\n');
    const ignoredFile = path.join(base, 'ignored', 'matches.txt');
    fs.mkdirSync(path.dirname(ignoredFile), { recursive: true });
    fs.writeFileSync(ignoredFile, needleLine());

    const gitDirFile = path.join(base, '.git', 'matches.txt');
    fs.mkdirSync(path.dirname(gitDirFile), { recursive: true });
    fs.writeFileSync(gitDirFile, needleLine());

    const escapeTarget = path.join(outside, 'outside.txt');
    fs.writeFileSync(escapeTarget, needleLine());
    const escape = path.join(base, 'escape');
    fs.symlinkSync(outside, escape);

    const binary = path.join(base, 'binary.bin');
    fs.writeFileSync(
      binary,
      Buffer.concat([Buffer.from([0, 1, 2]), Buffer.from(needleLine()), Buffer.from([0, 0])]),
    );

    const overCeiling = path.join(base, 'over-ceiling.txt');
    fs.writeFileSync(overCeiling, 'x'.repeat(21 * 1024 * 1024));

    const giantLine = path.join(base, 'giant-line.txt');
    fs.writeFileSync(giantLine, `${'x'.repeat(1024 * 1024)}${needleLine()}`);

    const crlf = path.join(base, 'crlf.txt');
    fs.writeFileSync(crlf, `one\r\n${HOSTILE_NEEDLE}\r\ntwo\r\n`);

    const bom = path.join(base, 'bom.txt');
    fs.writeFileSync(bom, `${String.fromCharCode(0xfeff)}${needleLine()}`);

    const nonUtf8 = Buffer.concat([
      Buffer.from(`${base}${path.sep}non-utf8-`),
      Buffer.from([0xff, 0xfe]),
      Buffer.from('.txt'),
    ]);
    fs.writeFileSync(nonUtf8, needleLine());

    const sentinel = path.join(base, 'sentinel-touched-by-injection');

    return {
      base,
      dash,
      dashLongOutput,
      dashPreSh,
      withSpace,
      withQuote,
      withStar,
      withNewline,
      nfc,
      nfd,
      nonUtf8,
      gitignore,
      ignoredFile,
      gitDirFile,
      escape,
      binary,
      overCeiling,
      giantLine,
      crlf,
      bom,
      sentinel,
    };
  };
}
