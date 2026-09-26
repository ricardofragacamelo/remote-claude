import { describe, expect, it } from 'vitest';

import { disclosedInput } from '@domain/audit';

describe('disclosedInput', () => {
  it('discloses a `Read` as where and how much, never what — S-27', () => {
    // A field that carried some of the file — the kind a later SDK could add — does not leave.
    const input = {
      file_path: '/srv/app/.env',
      offset: 10,
      limit: 20,
      pages: '1-2',
      content: 'SECRET=hunter2',
      file: { text: 'SECRET=hunter2' },
    };

    expect(disclosedInput('Read', input)).toEqual({
      file_path: '/srv/app/.env',
      offset: 10,
      limit: 20,
      pages: '1-2',
    });
  });

  it('discloses a `Read` with only its path as just the path', () => {
    expect(disclosedInput('Read', { file_path: '/srv/app/a.ts' })).toEqual({
      file_path: '/srv/app/a.ts',
    });
  });

  it('keeps a field of the window even when it is falsy', () => {
    // `in`, not truthiness: an offset of zero is a place in the file, not an absence.
    expect(disclosedInput('Read', { file_path: '/a', offset: 0 })).toEqual({
      file_path: '/a',
      offset: 0,
    });
  });

  it('discloses every other tool exactly as it was called', () => {
    // The detail of an entry is what somebody reads to know what ran; a `Write` shows what it wrote.
    const input = { file_path: '/srv/app/a.md', content: 'x'.repeat(10_000) };

    expect(disclosedInput('Write', input)).toEqual(input);
    expect(disclosedInput('Bash', { command: 'rm -rf build' })).toEqual({
      command: 'rm -rf build',
    });
  });

  it('matches the tool name exactly, so a lookalike is not mistaken for a read', () => {
    expect(disclosedInput('read', { file_path: '/a', content: 'c' })).toEqual({
      file_path: '/a',
      content: 'c',
    });
  });

  it('hands back a copy, so the record cannot be changed through what it disclosed', () => {
    const input = { command: 'ls' };
    const disclosed = disclosedInput('Bash', input);

    disclosed['command'] = 'rm -rf /';

    expect(input.command).toBe('ls');
  });
});
