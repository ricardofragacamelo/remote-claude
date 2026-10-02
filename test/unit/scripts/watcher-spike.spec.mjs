import { describe, expect, it } from 'vitest';

import {
  EXCLUDED_PATHS,
  WATCHER_OPTIONS,
  inotifyWatchesIn,
  isExcludedPath,
  markdownTable,
  parseSpikeArgs,
  spikeTable,
} from '../../../scripts/lib/watcher-spike.mjs';

describe('the watcher spike — plan 07, B-19', () => {
  it('counts one watch per `inotify wd:` line of an fdinfo', () => {
    const fdinfo = [
      'pos:\t0',
      'flags:\t02004000',
      'inotify wd:2 ino:1 sdev:800001 mask:fce ignored_mask:0',
      'inotify wd:1 ino:2 sdev:800001 mask:fce ignored_mask:0',
      '',
    ].join('\n');

    expect(inotifyWatchesIn(fdinfo)).toBe(2);
    expect(inotifyWatchesIn('pos:\t0\n')).toBe(0);
  });

  it('excludes .git and the D-10 folders at any depth, and nothing else', () => {
    expect(EXCLUDED_PATHS).toContain('.git');
    expect(isExcludedPath('node_modules')).toBe(true);
    expect(isExcludedPath('web/node_modules/react')).toBe(true);
    expect(isExcludedPath('a/.git/objects/x')).toBe(true);
    expect(isExcludedPath('')).toBe(false);
    expect(isExcludedPath('src/distance')).toBe(false);
    expect(isExcludedPath('x/y', ['x/y/z'])).toBe(false);
  });

  it('reads its options, and tells a flag from a value', () => {
    expect(
      parseSpikeArgs(['--tree', '/t', '--libs', '/l', '--limit', '300', '--midflight', '--json']),
    ).toEqual({
      tree: '/t',
      libs: '/l',
      option: null,
      limit: 300,
      midflight: true,
      json: true,
      help: false,
    });
    expect(parseSpikeArgs(['--option', 'fs', '-h'])).toMatchObject({ option: 'fs', help: true });
    expect(parseSpikeArgs(['--help', '--tree'])).toMatchObject({ tree: null, help: true });
  });

  it('turns the reports into the table the decision quotes', () => {
    const rows = spikeTable(
      [
        {
          option: 'fs',
          status: 'measured',
          readyMs: 12.4,
          watches: 9,
          events: { excluded: 1, watched: 1 },
          grown: { heard: 0 },
          error: 'ENOSPC',
        },
        {
          option: 'chokidar',
          status: 'missing',
          readyMs: null,
          watches: null,
          events: null,
          error: null,
        },
        {
          option: 'parcel',
          status: 'failed',
          readyMs: null,
          watches: 0,
          events: null,
          error: null,
        },
      ],
      { limit: 300, midflight: true },
    );

    expect(rows[0]).toEqual([
      'option',
      'watches',
      'ready (ms)',
      'excluded dir events',
      'watched dir events',
      'grown files heard',
      'at limit 300',
    ]);
    expect(rows[1]).toEqual(['fs', '9', '12', '1', '1', '0', 'ENOSPC']);
    expect(rows[2]).toEqual(['chokidar', '—', '—', '—', '—', '—', 'not installed']);
    expect(rows[3]).toEqual(['parcel', '0', '—', '—', '—', '—', 'none (silent)']);
    expect(spikeTable([], { limit: null, midflight: false })[0]).toContain('error');
    expect(WATCHER_OPTIONS).toEqual(['fs', 'chokidar', 'parcel']);
  });

  it('writes the table as Markdown', () => {
    expect(
      markdownTable([
        ['a', 'b'],
        ['1', '2'],
      ]),
    ).toBe('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(markdownTable([])).toBe('|  |\n||');
  });
});
