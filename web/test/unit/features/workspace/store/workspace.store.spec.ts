import { beforeEach, describe, expect, it } from 'vitest';

import { useWorkspaceStore } from '@/features/workspace';

describe('the workspace selection', () => {
  beforeEach(() => {
    useWorkspaceStore.getState().select(null);
  });

  it('starts with nothing chosen', () => {
    expect(useWorkspaceStore.getState().selected).toBeNull();
  });

  it('remembers what was chosen', () => {
    useWorkspaceStore.getState().select('/srv/projects');

    expect(useWorkspaceStore.getState().selected).toBe('/srv/projects');
  });

  it('replaces the choice rather than adding to it', () => {
    useWorkspaceStore.getState().select('/srv/a');
    useWorkspaceStore.getState().select('/srv/b');

    expect(useWorkspaceStore.getState().selected).toBe('/srv/b');
  });

  it('can be cleared, which is not the same as never having chosen', () => {
    useWorkspaceStore.getState().select('/srv/a');
    useWorkspaceStore.getState().select(null);

    expect(useWorkspaceStore.getState().selected).toBeNull();
  });
});
