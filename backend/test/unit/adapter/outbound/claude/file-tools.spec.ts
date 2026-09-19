import { describe, expect, it } from 'vitest';

import { pathsWrittenBy } from '@adapter/outbound/claude/file-tools';

describe('pathsWrittenBy', () => {
  it.each([
    ['Write', 'file_path'],
    ['Edit', 'file_path'],
    ['MultiEdit', 'file_path'],
    ['NotebookEdit', 'notebook_path'],
  ])('reads the path %s puts in `%s`', (toolName, field) => {
    expect(pathsWrittenBy(toolName, { [field]: '/srv/projects/app/a.md' })).toEqual([
      '/srv/projects/app/a.md',
    ]);
  });

  it.each(['Read', 'Bash', 'Glob', 'Grep', 'WebFetch'])('answers nothing for %s', (toolName) => {
    // Asking a tool that does not write would snapshot files nobody touched.
    expect(pathsWrittenBy(toolName, { file_path: '/srv/projects/app/a.md' })).toEqual([]);
  });

  it('answers nothing for an MCP tool', () => {
    // An MCP tool can write anywhere and says nothing about it in its input. Promising undo for a
    // path we cannot identify is worse than saying plainly that we cannot.
    expect(pathsWrittenBy('mcp__files__write', { file_path: '/srv/projects/app/a.md' })).toEqual(
      [],
    );
  });

  it('refuses a relative path rather than resolving it', () => {
    // It would resolve against whatever the backend's working directory happens to be, which is
    // not the session's. Better no snapshot than one of the wrong file.
    expect(pathsWrittenBy('Write', { file_path: 'a.md' })).toEqual([]);
  });

  it.each([
    ['no input at all', undefined],
    ['a null input', null],
    ['an input with no path', {}],
    ['a path that is not a string', { file_path: 42 }],
    ['an array instead of an object', []],
  ])('answers nothing for %s', (_case, input) => {
    expect(pathsWrittenBy('Write', input)).toEqual([]);
  });

  it('reads the notebook path and not the file path of a notebook edit', () => {
    expect(
      pathsWrittenBy('NotebookEdit', { notebook_path: '/a.ipynb', file_path: '/b.md' }),
    ).toEqual(['/a.ipynb']);
  });
});
