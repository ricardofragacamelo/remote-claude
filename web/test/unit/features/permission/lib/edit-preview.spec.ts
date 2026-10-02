import { describe, expect, it } from 'vitest';

import { previewOf, writtenPath } from '@/features/permission/lib/edit-preview';
import { relativeTo as insideFolder } from '@/shared/lib/folder-path';

const FILE = 'a\nb\nc\nd\ne\nf\ng\nh\n';
const text = (content: string) => ({ kind: 'text', content }) as const;

/** The kinds and texts of the lines of each hunk, for an assertion that reads like the diff. */
function lines(preview: ReturnType<typeof previewOf>): string[][] {
  return preview.kind === 'hunks'
    ? preview.hunks.map((hunk) => hunk.lines.map((line) => `${line.kind[0] ?? ''}${line.text}`))
    : [];
}

describe('the preview of a change before it is approved — plan 08, B-29', () => {
  it('knows the file a tool writes, and whether it is in the folder', () => {
    expect(writtenPath({ file_path: '/srv/app/a.ts' })).toBe('/srv/app/a.ts');
    expect(writtenPath({ file_path: 'a.ts' })).toBeNull();
    expect(writtenPath({})).toBeNull();
    expect(insideFolder('/srv/app', '/srv/app/src/a.ts')).toBe('src/a.ts');
    expect(insideFolder('/srv/app/', '/srv/app/a.ts')).toBe('a.ts');
    expect(insideFolder('/srv/app', '/srv/app-old/a.ts')).toBeNull();
  });

  it('of an edit, is the lines it touches against the disk now, with what surrounds them — S-127', () => {
    const preview = previewOf('Edit', { old_string: 'e', new_string: 'E' }, text(FILE));

    expect(lines(preview)).toEqual([['cb', 'cc', 'cd', 're', 'aE', 'cf', 'cg', 'ch']]);
    expect(preview.kind === 'hunks' ? preview.hunks[0]?.oldStart : null).toBe(2);
  });

  it('of an edit in the middle of a line, keeps the rest of the line', () => {
    expect(
      lines(previewOf('Edit', { old_string: 'lo', new_string: 'LO' }, text('hello world'))),
    ).toEqual([['rhello world', 'ahelLO world']]);
  });

  it('of a write of a new file, is all added — S-128', () => {
    expect(lines(previewOf('Write', { content: 'x\ny\n' }, { kind: 'absent' }))).toEqual([
      ['ax', 'ay'],
    ]);
  });

  it('of a write over a file, is what differs between its start and its end', () => {
    expect(lines(previewOf('Write', { content: 'a\nB\nc\n' }, text('a\nb\nc\n')))).toEqual([
      ['ca', 'rb', 'aB', 'cc'],
    ]);
    expect(previewOf('Write', { content: 'same' }, text('same'))).toEqual({
      kind: 'hunks',
      hunks: [],
    });
    expect(lines(previewOf('Write', {}, text('gone\n')))).toEqual([['rgone']]);
  });

  it('says an edit will not match when its text is not in the file now — S-129', () => {
    expect(previewOf('Edit', { old_string: 'zzz', new_string: 'y' }, text(FILE))).toEqual({
      kind: 'noMatch',
      edit: 0,
      reason: 'missing',
    });
    expect(previewOf('Edit', { new_string: 'y' }, text(FILE))).toMatchObject({ kind: 'noMatch' });
    expect(
      previewOf('Edit', { old_string: 'a', new_string: 'b' }, { kind: 'absent' }),
    ).toMatchObject({
      kind: 'noMatch',
    });
  });

  it('says an edit of text that appears twice, unasked, will be refused', () => {
    expect(previewOf('Edit', { old_string: 'x', new_string: 'y' }, text('x\nx\n'))).toEqual({
      kind: 'noMatch',
      edit: 0,
      reason: 'ambiguous',
    });
    expect(
      lines(
        previewOf('Edit', { old_string: 'x', new_string: 'y', replace_all: true }, text('x\nx\n')),
      ),
    ).toHaveLength(2);
  });

  it('of a multi-edit, applies each edit to what the one before left, and names the one that fails', () => {
    const edits = [
      { old_string: 'a', new_string: 'A' },
      { old_string: 'A\nb', new_string: 'AB' },
      'not an edit',
    ];
    expect(lines(previewOf('MultiEdit', { edits }, text('a\nb\n')))).toEqual([
      ['ra', 'aA', 'cb'],
      ['rA', 'rb', 'aAB'],
    ]);
    expect(
      previewOf(
        'MultiEdit',
        {
          edits: [
            { old_string: 'a', new_string: 'A' },
            { old_string: 'q', new_string: 'Q' },
          ],
        },
        text('a'),
      ),
    ).toMatchObject({ kind: 'noMatch', edit: 1 });
    expect(previewOf('MultiEdit', {}, text('a'))).toEqual({ kind: 'hunks', hunks: [] });
  });

  it('shows a CRLF file without its carriage returns', () => {
    expect(
      lines(previewOf('Edit', { old_string: 'b', new_string: 'B' }, text('a\r\nb\r\n'))),
    ).toEqual([['ca', 'rb', 'aB']]);
  });
});
