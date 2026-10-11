import { describe, expect, it } from 'vitest';

import { changesFileText, commandOf, readToolCall } from '@/shared/lib/tool-call';

const ORIGIN = { engine: 'claude', native: 'Edit' };

describe('the canonical fields of a tool call — plan 28 B-18', () => {
  it('reads every field the contract carries', () => {
    expect(
      readToolCall({
        kind: 'file.edit',
        label: { messageKey: 'sessions.tool.fileEdit', params: { path: 'a.ts', added: 1 } },
        subject: { paths: ['/w/a.ts'] },
        changes: [{ path: '/w/a.ts', op: 'edit' }],
        origin: ORIGIN,
        rawInput: { anything: true },
      }),
    ).toEqual({
      kind: 'file.edit',
      label: { messageKey: 'sessions.tool.fileEdit', params: { path: 'a.ts', added: 1 } },
      subject: { paths: ['/w/a.ts'] },
      changes: [{ path: '/w/a.ts', op: 'edit' }],
      origin: ORIGIN,
      rawInput: { anything: true },
    });
  });

  it('is nothing without a kind — not a frame of this protocol', () => {
    expect(readToolCall({ toolUseId: 't1' })).toBeNull();
    expect(readToolCall({ kind: '' })).toBeNull();
    expect(readToolCall({ kind: 7 })).toBeNull();
  });

  it('reads every other field out of shape as empty, never as a crash — S-56', () => {
    expect(
      readToolCall({
        kind: 'vcs.commit',
        label: { messageKey: 3 },
        subject: 'x',
        changes: [{ path: '/a' }, 'b', { path: '/c', op: 'write' }],
        origin: { engine: 'e' },
        rawInput: ['not', 'an', 'object'],
      }),
    ).toEqual({
      kind: 'vcs.commit',
      label: { messageKey: '', params: {} },
      subject: {},
      changes: [{ path: '/c', op: 'write' }],
      origin: { engine: '', native: '' },
      rawInput: {},
    });
    expect(readToolCall({ kind: 'shell', changes: 'none' })?.changes).toEqual([]);
  });

  it('keeps only the params a label can interpolate', () => {
    expect(
      readToolCall({
        kind: 'shell',
        label: {
          messageKey: 'sessions.tool.shell',
          params: { command: 'ls', n: 2, deep: { a: 1 }, none: null, flag: true },
        },
      })?.label.params,
    ).toEqual({ command: 'ls', n: 2 });
  });
});

describe('what a call turns on', () => {
  it('turns on the diff for an edit or a whole write only', () => {
    expect(changesFileText([{ path: '/a', op: 'edit' }])).toBe(true);
    expect(
      changesFileText([
        { path: '/a', op: 'delete' },
        { path: '/b', op: 'write' },
      ]),
    ).toBe(true);
    expect(
      changesFileText([
        { path: '/a', op: 'delete' },
        { path: '/b', op: 'move', to: '/c' },
      ]),
    ).toBe(false);
    expect(changesFileText([])).toBe(false);
  });

  it('turns on the IN and OUT by the command line', () => {
    expect(commandOf({ command: 'pnpm test' })).toBe('pnpm test');
    expect(commandOf({ command: '' })).toBe('');
    expect(commandOf({ paths: ['/a'] })).toBeNull();
  });
});
