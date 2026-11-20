import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RipgrepAdapter } from '@adapter/outbound/search/ripgrep.adapter';
import { NodeChildProcessRunner } from '@adapter/outbound/process/node-child-process.runner';
import type { ProcessBudget } from '@application/search';
import { matchPreviewOf, utf16ColumnOf } from '@domain/search';
import type { SearchTextOptions } from '@domain/search';
import { resolveRipgrepBinary } from '@infra/config/ripgrep-binary';
import { RecordingLogger } from '../../../../support/fakes/recording-logger';

const BUDGET: ProcessBudget = { timeoutMs: 15_000, maxBytes: 64 * 1024 * 1024 };

const OPTIONS: SearchTextOptions = {
  isRegex: false,
  caseSensitive: false,
  wholeWord: false,
  multiline: false,
  contextLines: 0,
  respectDefaultsAndIgnoreFiles: true,
  maxFileBytes: 20_971_520,
  multilineMaxFileBytes: 5_242_880,
};

async function drain<T>(items: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of items) {
    out.push(item);
  }
  return out;
}

describe('RipgrepAdapter.searchText against a real ripgrep binary — plan 11, B-10', () => {
  let folder: string;

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'rc-search-text-'));
  });

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  async function adapterOf(): Promise<RipgrepAdapter> {
    const logger = new RecordingLogger().logger;
    const runner = new NodeChildProcessRunner(logger);
    const binary = await resolveRipgrepBinary(null, logger);
    return new RipgrepAdapter(runner, binary);
  }

  it('finds a match and reports its real byte offsets — S-64', async () => {
    await writeFile(join(folder, 'a.txt'), 'hello needle world\n');
    const adapter = await adapterOf();

    const run = adapter.searchText(folder, 'needle', OPTIONS, BUDGET, new AbortController().signal);
    const files = await drain(run.files);

    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe('a.txt');
    expect(files[0]?.lines[0]?.submatches).toEqual([{ startByte: 6, endByte: 12, text: 'needle' }]);
    await expect(run.outcome).resolves.toEqual({ truncated: false, timedOut: false, skipped: 0 });
  });

  it('reports a byte offset that only resolves to the right column once decoded — S-65', async () => {
    // "wörld " is 7 bytes (ö is 2) but 6 UTF-16 units; "foo" starts right after it.
    await writeFile(join(folder, 'b.txt'), 'wörld foo\n', 'utf8');
    const adapter = await adapterOf();

    const [file] = await drain(
      adapter.searchText(folder, 'foo', OPTIONS, BUDGET, new AbortController().signal).files,
    );
    const [line] = file?.lines ?? [];
    const [submatch] = line?.submatches ?? [];

    expect(submatch?.startByte).toBe(Buffer.byteLength('wörld ', 'utf8'));
    const lineBytes = Buffer.from(line?.lineText ?? '', 'utf8');
    expect(utf16ColumnOf(lineBytes, submatch?.startByte ?? 0)).toBe('wörld '.length);
  });

  it('a minified line is reported whole by the engine — cropping to a preview is this backend’s own job — S-66', async () => {
    const line = `${'x'.repeat(50_000)}NEEDLE${'y'.repeat(50_000)}`;
    await writeFile(join(folder, 'big.txt'), `${line}\n`);
    const adapter = await adapterOf();

    const files = await drain(
      adapter.searchText(folder, 'NEEDLE', OPTIONS, BUDGET, new AbortController().signal).files,
    );
    expect(files).toHaveLength(1);
    const [matchedLine] = files[0]!.lines;
    expect(matchedLine).toBeDefined();
    const [submatch] = matchedLine!.submatches;
    expect(submatch).toBeDefined();

    expect(matchedLine!.lineText.length).toBe(line.length);

    const preview = matchPreviewOf(
      matchedLine!.lineText,
      submatch!.startByte,
      submatch!.endByte,
      10,
    );
    expect(preview.text).toBe(`${'x'.repeat(10)}NEEDLE${'y'.repeat(10)}`);
  });

  it('is case-insensitive by default, and case-sensitive when asked', async () => {
    await writeFile(join(folder, 'c.txt'), 'Needle\n');
    const adapter = await adapterOf();

    const insensitive = await drain(
      adapter.searchText(folder, 'needle', OPTIONS, BUDGET, new AbortController().signal).files,
    );
    const sensitive = await drain(
      adapter.searchText(
        folder,
        'needle',
        { ...OPTIONS, caseSensitive: true },
        BUDGET,
        new AbortController().signal,
      ).files,
    );

    expect(insensitive).toHaveLength(1);
    expect(sensitive).toHaveLength(0);
  });

  it('respects wholeWord — S-37', async () => {
    await writeFile(join(folder, 'd.txt'), 'needlework needle\n');
    const adapter = await adapterOf();

    const files = await drain(
      adapter.searchText(
        folder,
        'needle',
        { ...OPTIONS, wholeWord: true },
        BUDGET,
        new AbortController().signal,
      ).files,
    );

    expect(files[0]?.lines[0]?.submatches).toHaveLength(1);
  });

  it('treats the pattern as a literal when isRegex is false — a dot never matches any character', async () => {
    await writeFile(join(folder, 'e.txt'), 'a.b\naxb\n');
    const adapter = await adapterOf();

    const files = await drain(
      adapter.searchText(folder, 'a.b', OPTIONS, BUDGET, new AbortController().signal).files,
    );

    expect(files[0]?.lines).toHaveLength(1);
    expect(files[0]?.lines[0]?.lineText).toBe('a.b');
  });

  it('matches across lines once multiline is on — S-38', async () => {
    await writeFile(join(folder, 'f.txt'), 'start\nend\n');
    const adapter = await adapterOf();

    const files = await drain(
      adapter.searchText(
        folder,
        'start\\nend',
        { ...OPTIONS, isRegex: true, multiline: true },
        BUDGET,
        new AbortController().signal,
      ).files,
    );

    expect(files).toHaveLength(1);
  });

  it('returns context lines around a match when contextLines is set', async () => {
    await writeFile(join(folder, 'g.txt'), 'before\nneedle\nafter\n');
    const adapter = await adapterOf();

    const [file] = await drain(
      adapter.searchText(
        folder,
        'needle',
        { ...OPTIONS, contextLines: 1 },
        BUDGET,
        new AbortController().signal,
      ).files,
    );

    expect(file?.contextLines.map((context) => context.lineText)).toEqual(['before', 'after']);
  });

  it('respects a glob exclude on top of the defaults', async () => {
    await writeFile(join(folder, 'included.txt'), 'needle\n');
    await writeFile(join(folder, 'excluded.txt'), 'needle\n');
    const adapter = await adapterOf();

    const files = await drain(
      adapter.searchText(
        folder,
        'needle',
        { ...OPTIONS, exclude: ['excluded.txt'] },
        BUDGET,
        new AbortController().signal,
      ).files,
    );

    expect(files.map((file) => file.path)).toEqual(['included.txt']);
  });

  it('restricts the search to onlyPaths when given', async () => {
    await writeFile(join(folder, 'one.txt'), 'needle\n');
    await writeFile(join(folder, 'two.txt'), 'needle\n');
    const adapter = await adapterOf();

    const files = await drain(
      adapter.searchText(
        folder,
        'needle',
        { ...OPTIONS, onlyPaths: ['one.txt'] },
        BUDGET,
        new AbortController().signal,
      ).files,
    );

    expect(files.map((file) => file.path)).toEqual(['one.txt']);
  });

  it('answers no files and a clean outcome when nothing matches — S-75', async () => {
    await writeFile(join(folder, 'a.txt'), 'nothing here\n');
    const adapter = await adapterOf();

    const run = adapter.searchText(folder, 'needle', OPTIONS, BUDGET, new AbortController().signal);
    const files = await drain(run.files);

    expect(files).toEqual([]);
    await expect(run.outcome).resolves.toEqual({ truncated: false, timedOut: false, skipped: 0 });
  });

  it('a binary file found while walking the folder is silently absent, never a result — S-67', async () => {
    // Measured: unlike an explicit path, the folder walk excludes a binary file on its own
    // (the same way it excludes one over the size ceiling) — rg never emits a line for it at
    // all, so there is no per-file signal this engine can count it by in this path.
    await writeFile(join(folder, 'bin.dat'), Buffer.from('needle\x00binary junk\x01\x02'));
    await writeFile(join(folder, 'plain.txt'), 'needle here\n');
    const adapter = await adapterOf();

    const run = adapter.searchText(folder, 'needle', OPTIONS, BUDGET, new AbortController().signal);
    const files = await drain(run.files);

    expect(files.map((file) => file.path)).toEqual(['plain.txt']);
    await expect(run.outcome).resolves.toEqual({ truncated: false, timedOut: false, skipped: 0 });
  });

  it('a binary file named explicitly through onlyPaths is counted in skipped, not returned — S-67', async () => {
    // Unlike the walk, an explicit path (onlyPaths — only the tab's open editors) is never
    // filtered on its own, so the engine still reports it, flagged with a binary offset.
    await writeFile(join(folder, 'bin.dat'), Buffer.from('needle\x00binary junk\x01\x02'));
    await writeFile(join(folder, 'plain.txt'), 'needle here\n');
    const adapter = await adapterOf();

    const run = adapter.searchText(
      folder,
      'needle',
      { ...OPTIONS, onlyPaths: ['bin.dat', 'plain.txt'] },
      BUDGET,
      new AbortController().signal,
    );
    const files = await drain(run.files);

    expect(files.map((file) => file.path)).toEqual(['plain.txt']);
    await expect(run.outcome).resolves.toEqual({ truncated: false, timedOut: false, skipped: 1 });
  });

  it('an onlyPaths entry deleted after the tab opened it does not fail the rest of the search — S-76', async () => {
    await writeFile(join(folder, 'present.txt'), 'needle here\n');
    const adapter = await adapterOf();

    const run = adapter.searchText(
      folder,
      'needle',
      { ...OPTIONS, onlyPaths: ['present.txt', 'gone.txt'] },
      BUDGET,
      new AbortController().signal,
    );
    const files = await drain(run.files);

    expect(files.map((file) => file.path)).toEqual(['present.txt']);
    await expect(run.outcome).resolves.toEqual({ truncated: false, timedOut: false, skipped: 0 });
  });
});
