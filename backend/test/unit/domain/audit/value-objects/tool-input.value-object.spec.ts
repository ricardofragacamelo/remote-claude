import { describe, expect, it } from 'vitest';

import { ToolInput } from '@domain/audit';

describe('ToolInput', () => {
  it('captures what it was given', () => {
    expect(ToolInput.capture({ command: 'git status' }).value).toEqual({ command: 'git status' });
  });

  it('rehydrates from what was stored', () => {
    expect(ToolInput.restore('{"command":"git status"}').value).toEqual({ command: 'git status' });
  });

  it('round-trips without losing anything, however nested', () => {
    const input = { command: 'git status', options: { cwd: '/srv', flags: ['-s', '-b'] } };

    expect(ToolInput.restore(ToolInput.capture(input).toString()).value).toEqual(input);
  });

  it('prints as it is stored, so a repository writes what the trail holds', () => {
    expect(ToolInput.capture({ a: 1 }).toString()).toBe('{"a":1}');
  });

  it('hands back a fresh object each time', () => {
    // Otherwise a caller could reach into a record of what was executed and change it.
    const input = ToolInput.capture({ command: 'git status' });

    expect(input.value).not.toBe(input.value);
  });

  it('keeps an empty input, which is what several tools are called with', () => {
    expect(ToolInput.capture({}).value).toEqual({});
  });
});
