import { describe, expect, it } from 'vitest';

import { SearchEngineFailedError } from '@domain/search';

describe('SearchEngineFailedError', () => {
  it('carries the code and messageKey of a dependency that fell over', () => {
    const error = new SearchEngineFailedError('ENOENT');

    expect(error.code).toBe('SEARCH_ENGINE_FAILED');
    expect(error.messageKey).toBe('search.error.engineFailed');
    expect(error.message).toContain('ENOENT');
  });

  it('never carries the reason as a param — nothing to translate from it', () => {
    const error = new SearchEngineFailedError('exit code 2');

    expect(error.params).toEqual({});
  });
});
