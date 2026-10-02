import { describe, expect, it } from 'vitest';

import {
  absoluteIn,
  attachmentsOf,
  BYTES_PER_TOKEN,
  itemsOfPayload,
  MAX_CONTEXT_ITEMS,
  merged,
  totalsOf,
  UNCHECKED,
  unsendable,
  without,
} from '@/features/session/lib/context-set';
import type { ContextItem, UploadItem } from '@/features/session/types/context';

const FOLDER = '/srv/projects/app';
const LIMITS = { contextWarnFraction: 0.25, contextMaxBytes: 1_000 };

const file = (path: string, size: number | null = null): ContextItem => ({
  id: `f:${path}`,
  kind: 'file',
  path,
  ...UNCHECKED,
  size,
});
const range = (path: string, startLine: number, endLine: number): ContextItem => ({
  id: `r:${path}:${String(startLine)}`,
  kind: 'range',
  path,
  startLine,
  endLine,
  ...UNCHECKED,
});
const upload = (overrides: Partial<UploadItem> = {}): UploadItem => ({
  id: 'u:1',
  kind: 'upload',
  name: 'shot.png',
  mediaType: 'image/png',
  size: 400,
  uploadKind: 'image',
  attachmentId: 'att_1',
  error: null,
  ...overrides,
});

describe('the set of context — plan 08, B-47', () => {
  it('makes one chip a file, a folder and a selection of a payload — a folder never expanded (S-233, S-235)', () => {
    const items = itemsOfPayload({
      folder: FOLDER,
      entries: [
        { path: 'src/a.ts', kind: 'file' },
        { path: 'node_modules', kind: 'directory' },
      ],
      selection: {
        path: 'b.ts',
        range: { startLine: 3, startColumn: 1, endLine: 5, endColumn: 2 },
      },
    });

    expect(items.map((item) => item.kind)).toEqual(['file', 'folder', 'range']);
    expect(items[2]).toMatchObject({ path: 'b.ts', startLine: 3, endLine: 5 });
    expect(new Set(items.map((item) => item.id)).size).toBe(3);
  });

  it('keeps one chip for the same file, folder, range, upload or text — S-220', () => {
    const text: ContextItem = {
      id: 't',
      kind: 'text',
      source: 'terminal',
      label: 'bash',
      content: 'x',
    };
    const first = merged(
      [],
      [file('a.ts'), { id: 'd', kind: 'folder', path: 'src' }, range('b.ts', 1, 2), upload(), text],
    );
    const again = merged(first.items, [
      file('a.ts'),
      { id: 'd2', kind: 'folder', path: 'src' },
      range('b.ts', 1, 2),
      upload({ id: 'u:2' }),
      { ...text, id: 't2' },
    ]);

    expect(first.added).toBe(5);
    expect(again).toMatchObject({ added: 0, duplicates: 5, overflow: 0 });
    expect(again.items).toHaveLength(5);
  });

  it('adds nothing for a range of a file already whole, and lets a whole file replace its ranges — S-220', () => {
    const whole = merged([file('a.ts')], [range('a.ts', 1, 3)]);
    const replacing = merged([range('a.ts', 1, 3), range('b.ts', 1, 1)], [file('a.ts')]);

    expect(whole).toMatchObject({ added: 0, duplicates: 1 });
    expect(
      replacing.items.map((item) => `${item.kind}:${'path' in item ? item.path : ''}`),
    ).toEqual(['range:b.ts', 'file:a.ts']);
  });

  it('takes items up to the ceiling, and counts what it left out — S-235', () => {
    const many = Array.from({ length: MAX_CONTEXT_ITEMS + 3 }, (_, index) =>
      file(`f${String(index)}.ts`),
    );

    const result = merged([], many);

    expect(result.items).toHaveLength(MAX_CONTEXT_ITEMS);
    expect(result).toMatchObject({ added: MAX_CONTEXT_ITEMS, overflow: 3 });
  });

  it('estimates tokens at four bytes, counts folders as items, and warns past the share of the free window — S-219', () => {
    const items = [
      file('a.ts', 400),
      { id: 'd', kind: 'folder', path: 'src' } as ContextItem,
      upload({ size: 100 }),
    ];

    const calm = totalsOf(items, LIMITS, 10_000);
    const near = totalsOf(items, LIMITS, 400);

    expect(calm).toEqual({
      bytes: 500,
      tokens: 500 / BYTES_PER_TOKEN,
      items: 3,
      folders: 1,
      level: 'ok',
      over: null,
    });
    expect(near.level).toBe('warn');
  });

  it('counts a text by its bytes, and refuses past the ceiling of bytes — S-219', () => {
    const text: ContextItem = {
      id: 't',
      kind: 'text',
      source: 'terminal',
      label: 'b',
      content: 'é',
    };

    expect(totalsOf([text], LIMITS, 1_000).bytes).toBe(2);
    expect(totalsOf([file('big.bin', 1_001)], LIMITS, 1_000_000)).toMatchObject({
      level: 'over',
      over: 'bytes',
    });
  });

  it('refuses a set past the ceiling of items, as a reload may give back — S-219', () => {
    const many = Array.from({ length: MAX_CONTEXT_ITEMS + 1 }, (_, index) =>
      file(`f${String(index)}`, 1),
    );

    expect(totalsOf(many, LIMITS, 1_000_000)).toMatchObject({ level: 'over', over: 'items' });
  });

  it('says why a set cannot be sent: a file gone, an upload refused or still away, a ceiling — S-223', () => {
    const fine = totalsOf([], LIMITS, 1_000);

    expect(unsendable([{ ...file('a.ts'), missing: true } as ContextItem], fine)).toEqual({
      reason: 'missing',
      path: 'a.ts',
    });
    expect(unsendable([upload({ attachmentId: null })], fine)).toEqual({
      reason: 'upload',
      name: 'shot.png',
    });
    expect(unsendable([upload({ attachmentId: null })], fine, true)).toBeNull();
    expect(unsendable([upload({ error: new Error('x') as never })], fine, true)).toMatchObject({
      reason: 'upload',
    });
    expect(unsendable([], { ...fine, over: 'items', level: 'over' })).toEqual({
      reason: 'over',
      over: 'items',
    });
    expect(unsendable([file('a.ts')], fine)).toBeNull();
  });

  it('names every reference absolute, inside the folder of the tab — S-230', () => {
    const items: ContextItem[] = [
      file('src/a.ts'),
      range('b.ts', 2, 4),
      { id: 'd', kind: 'folder', path: '' },
      upload(),
      upload({ id: 'u:2', attachmentId: null }),
      { id: 't', kind: 'text', source: 'terminal', label: 'bash', content: 'out' },
    ];

    expect(attachmentsOf(FOLDER, items)).toEqual([
      { kind: 'file', path: `${FOLDER}/src/a.ts` },
      { kind: 'file', path: `${FOLDER}/b.ts`, range: { startLine: 2, endLine: 4 } },
      { kind: 'folder', path: FOLDER },
      { kind: 'upload', attachmentId: 'att_1' },
      { kind: 'text', source: 'terminal', label: 'bash', content: 'out' },
    ]);
  });

  it('builds absolute paths at the root and from a folder written with a slash', () => {
    expect(absoluteIn('/', 'a.ts')).toBe('/a.ts');
    expect(absoluteIn('/', '.')).toBe('/');
    expect(absoluteIn(`${FOLDER}/`, './x/y')).toBe(`${FOLDER}/x/y`);
    expect(absoluteIn(FOLDER, '../out')).toBe(`${FOLDER}/../out`);
  });

  it('removes an item by its id', () => {
    expect(without([file('a.ts'), file('b.ts')], 'f:a.ts').map((item) => item.id)).toEqual([
      'f:b.ts',
    ]);
  });
});
