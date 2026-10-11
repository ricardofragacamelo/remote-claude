import { describe, expect, it } from 'vitest';

import { disclosedInput } from '@domain/audit';
import type { CanonicalTool } from '@domain/engine';
import { claudeTool } from '../../../../support/builders/tool.builder';

/** What the trail kept of a call, and the call as the engine's classifier reads it. */
function disclosed(name: string, input: Record<string, unknown>): Record<string, unknown> {
  return disclosedInput(claudeTool(name, input), input);
}

describe('disclosedInput — plan 28, B-16 / S-52', () => {
  it('discloses a `file.read` as where and how much, never what — S-27', () => {
    // A field that carried some of the file — the kind a later SDK could add — does not leave.
    const input = {
      file_path: '/srv/app/.env',
      offset: 10,
      limit: 20,
      pages: '1-2',
      content: 'SECRET=hunter2',
      file: { text: 'SECRET=hunter2' },
    };

    expect(disclosed('Read', input)).toEqual({
      paths: ['/srv/app/.env'],
      window: { offset: 10, limit: 20, pages: '1-2' },
    });
    expect(JSON.stringify(disclosed('Read', input))).not.toContain('hunter2');
  });

  it('discloses a `file.read` with only its path as just the path', () => {
    expect(disclosed('Read', { file_path: '/srv/app/a.ts' })).toEqual({
      paths: ['/srv/app/a.ts'],
    });
  });

  it('discloses a `file.read` that names no file as nothing at all', () => {
    expect(disclosed('Read', { content: 'SECRET' })).toEqual({});
  });

  it('keeps a field of the window even when it is falsy', () => {
    // An offset of zero is a place in the file, not an absence.
    expect(disclosed('Read', { file_path: '/a', offset: 0 })).toEqual({
      paths: ['/a'],
      window: { offset: 0 },
    });
  });

  it('discloses every read the engine has, by its kind and not by its name', () => {
    // `NotebookRead` is a `file.read` too: the rule follows the kind, so a second read tool of an
    // engine cannot carry the file out under another name.
    expect(disclosed('NotebookRead', { notebook_path: '/n.ipynb', cells: ['SECRET'] })).toEqual({
      paths: ['/n.ipynb'],
    });
  });

  it('discloses a `file.read` of any engine by its normalised subject alone', () => {
    // An engine the trail never heard of: the allowlist is of canonical fields, not of the engine's.
    const tool: CanonicalTool = {
      kind: 'file.read',
      label: { messageKey: 'sessions.tool.fileRead', params: { path: 'x' } },
      subject: { paths: ['/srv/x'], window: { pages: '3' } },
      changes: [],
      origin: { engine: 'other-engine', native: 'open_file' },
    };

    expect(disclosedInput(tool, { target: '/srv/x', body: 'SECRET' })).toEqual({
      paths: ['/srv/x'],
      window: { pages: '3' },
    });
  });

  it('discloses every other kind exactly as it was called', () => {
    // The detail of an entry is what somebody reads to know what ran; a write shows what it wrote.
    const input = { file_path: '/srv/app/a.md', content: 'x'.repeat(10_000) };

    expect(disclosed('Write', input)).toEqual(input);
    expect(disclosed('Bash', { command: 'rm -rf build' })).toEqual({ command: 'rm -rf build' });
    expect(disclosed('mcp__srv__get', { id: 1 })).toEqual({ id: 1 });
  });

  it('matches the engine`s name exactly, so a lookalike is not mistaken for a read', () => {
    // `read` is no tool of Claude Code: it is `other`, and `other` is disclosed whole.
    expect(disclosed('read', { file_path: '/a', content: 'c' })).toEqual({
      file_path: '/a',
      content: 'c',
    });
  });

  it('hands back a copy, so the record cannot be changed through what it disclosed', () => {
    const input = { command: 'ls' };
    const copy = disclosed('Bash', input);

    copy['command'] = 'rm -rf /';

    expect(input.command).toBe('ls');
  });

  it('hands back a copy of the subject, so the tool cannot be changed through it either', () => {
    const tool = claudeTool('Read', { file_path: '/a', limit: 3 });
    const copy = disclosedInput(tool, {}) as { paths: string[]; window: { limit: number } };

    copy.paths.push('/b');
    copy.window.limit = 99;

    expect(tool.subject).toEqual({ paths: ['/a'], window: { limit: 3 } });
  });
});
