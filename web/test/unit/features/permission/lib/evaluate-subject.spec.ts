import { describe, expect, it } from 'vitest';

import { hasSubject, subjectOf } from '@/features/permission/lib/evaluate-subject';

describe('subjectOf — the real, concrete subject of an invocation to test (plan 15, B-28, S-196)', () => {
  it('writes `command`, only for shell', () => {
    expect(subjectOf('shell', 'git status')).toEqual({ command: 'git status' });
  });

  it('writes `paths`, as a one-entry array, for every file kind', () => {
    for (const kind of [
      'file.read',
      'file.edit',
      'file.write',
      'file.delete',
      'file.move',
    ] as const) {
      expect(subjectOf(kind, '/etc/passwd')).toEqual({ paths: ['/etc/passwd'] });
    }
  });

  it('writes `url`, only for web.fetch', () => {
    expect(subjectOf('web.fetch', 'https://example.com')).toEqual({ url: 'https://example.com' });
  });

  it('writes only `server`, for mcp with no tool given', () => {
    expect(subjectOf('mcp', 'github')).toEqual({ server: 'github' });
  });

  it('writes only `server`, for mcp with a blank or whitespace-only tool', () => {
    expect(subjectOf('mcp', 'github', '')).toEqual({ server: 'github' });
    expect(subjectOf('mcp', 'github', '   ')).toEqual({ server: 'github' });
  });

  it('writes `server` and `tool`, for mcp with both given', () => {
    expect(subjectOf('mcp', 'github', 'create_issue')).toEqual({
      server: 'github',
      tool: 'create_issue',
    });
  });

  it('trims the server and the tool of mcp alike', () => {
    expect(subjectOf('mcp', '  github  ', '  create_issue  ')).toEqual({
      server: 'github',
      tool: 'create_issue',
    });
  });

  it('writes nothing at all, for a kind the grammar never narrows by subject', () => {
    for (const kind of ['search', 'web.search', 'agent'] as const) {
      expect(subjectOf(kind, 'whatever this is given')).toEqual({});
    }
  });

  it('writes nothing for a blank value, whatever the kind — trimmed to empty counts as blank', () => {
    expect(subjectOf('shell', '')).toEqual({});
    expect(subjectOf('shell', '   ')).toEqual({});
    expect(subjectOf('file.read', '  ')).toEqual({});
    expect(subjectOf('web.fetch', '')).toEqual({});
    expect(subjectOf('mcp', '')).toEqual({});
    expect(subjectOf('mcp', '  ')).toEqual({});
  });

  it('trims the subject before writing it, for every field that takes one', () => {
    expect(subjectOf('shell', '  git status  ')).toEqual({ command: 'git status' });
    expect(subjectOf('file.read', '  /etc/passwd  ')).toEqual({ paths: ['/etc/passwd'] });
    expect(subjectOf('web.fetch', '  https://example.com  ')).toEqual({
      url: 'https://example.com',
    });
  });
});

describe('hasSubject — whether a kind’s subject is filled in enough to test (S-196)', () => {
  it('is always true for a kind the grammar never narrows by subject', () => {
    for (const kind of ['search', 'web.search', 'agent'] as const) {
      expect(hasSubject(kind, '')).toBe(true);
      expect(hasSubject(kind, 'anything')).toBe(true);
    }
  });

  it('is false for every other kind with an empty or whitespace-only value', () => {
    for (const kind of ['shell', 'file.read', 'web.fetch', 'mcp'] as const) {
      expect(hasSubject(kind, '')).toBe(false);
      expect(hasSubject(kind, '   ')).toBe(false);
    }
  });

  it('is true for every other kind once the value has non-whitespace content', () => {
    for (const kind of ['shell', 'file.read', 'web.fetch', 'mcp'] as const) {
      expect(hasSubject(kind, 'x')).toBe(true);
    }
  });
});
