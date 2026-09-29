import { describe, expect, it } from 'vitest';

import {
  NOTIFICATION_CATALOGUE,
  NOTIFICATION_PARAM_MAX_LENGTH,
  problemsOf,
} from '@domain/notification';

describe('the notification catalogue — plan 06, S-174', () => {
  it('admits a known key with exactly its parameters', () => {
    expect(problemsOf('notification.command.failed', { command: 'x', code: 'CONFLICT' })).toEqual(
      [],
    );
  });

  it('admits a known key that takes no parameter', () => {
    expect(problemsOf('notification.connection.lost', {})).toEqual([]);
  });

  it('refuses a key it does not know', () => {
    expect(problemsOf('notification.made.up', {})).toEqual([
      { field: 'messageKey', rule: 'notInCatalogue' },
    ]);
  });

  it('refuses a parameter the key does not take — where content would hide', () => {
    expect(problemsOf('notification.connection.lost', { command: 'rm -rf /' })).toEqual([
      { field: 'params.command', rule: 'unexpected' },
    ]);
  });

  it('refuses a missing parameter — a sentence with a hole in it', () => {
    expect(problemsOf('notification.folder.notAllowed', {})).toEqual([
      { field: 'params.folder', rule: 'missing' },
    ]);
  });

  it('refuses a parameter longer than a path', () => {
    expect(
      problemsOf('notification.folder.notAllowed', {
        folder: 'x'.repeat(NOTIFICATION_PARAM_MAX_LENGTH + 1),
      }),
    ).toEqual([{ field: 'params.folder', rule: 'tooLong' }]);
  });

  it('admits a parameter exactly as long as the ceiling', () => {
    expect(
      problemsOf('notification.folder.notAllowed', {
        folder: 'x'.repeat(NOTIFICATION_PARAM_MAX_LENGTH),
      }),
    ).toEqual([]);
  });

  it('reports every problem at once', () => {
    expect(problemsOf('notification.tabs.saveFailed', { other: 1 })).toHaveLength(2);
  });

  it('checks against the catalogue it is given', () => {
    expect(
      problemsOf('custom.kind.here', {}, [{ messageKey: 'custom.kind.here', params: [] }]),
    ).toEqual([]);
  });

  it('names every key once', () => {
    const keys = NOTIFICATION_CATALOGUE.map((kind) => kind.messageKey);

    expect(new Set(keys).size).toBe(keys.length);
  });
});
