import { describe, expect, it } from 'vitest';

import { previousPermissionTitle, previousToolFields } from '@shared/protocol/previous-tool-fields';

/** The fields the previous protocol named a call by — plan 28, D-08 / D-22. */
describe('the previous fields of a tool call', () => {
  it('are the engine`s name and the raw input, from the canonical fields', () => {
    expect(
      previousToolFields({
        kind: 'shell',
        origin: { engine: 'claude', native: 'Bash' },
        rawInput: { command: 'ls' },
      }),
    ).toEqual({ toolName: 'Bash', input: { command: 'ls' } });
  });

  it('are nothing for a payload with no origin — one that is no tool call', () => {
    expect(previousToolFields({ toolUseId: 't1', status: 'succeeded' })).toEqual({});
  });

  it('say an empty name, and an empty input, rather than inventing either', () => {
    expect(previousToolFields({ origin: { engine: 'claude' } })).toEqual({
      toolName: '',
      input: {},
    });
    expect(previousToolFields({ origin: null, rawInput: { a: 1 } })).toEqual({
      toolName: '',
      input: { a: 1 },
    });
  });

  it('title a permission by the engine`s name, as the previous protocol keyed it', () => {
    expect(previousPermissionTitle({ origin: { engine: 'claude', native: 'Write' } })).toBe(
      'permission.tool.Write',
    );
    expect(previousPermissionTitle({})).toBe('permission.tool.');
  });
});
