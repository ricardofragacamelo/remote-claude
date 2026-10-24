import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useCreateArtifactFlow } from '@/engines/claude/settings/hooks/useCreateArtifactFlow';
import * as editorFeature from '@/features/editor';
import { providers } from '../../../../../support/render';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useCreateArtifactFlow — plan 13, D-18', () => {
  it('confirming an invalid name writes nothing — the dialog already guards this, this is the hook’s own', () => {
    const createFile = vi.spyOn(editorFeature, 'createFile');
    const onCreated = vi.fn();
    const { result } = renderHook(
      () =>
        useCreateArtifactFlow({
          folder: '/srv/app',
          pathFor: (name) => `.claude/commands/${name}.md`,
          contentFor: () => 'content',
          onCreated,
        }),
      { wrapper: providers() },
    );

    act(() => {
      result.current.setName('Not A Valid Name');
    });
    act(() => {
      result.current.confirm();
    });

    expect(createFile).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('confirming with no name at all also writes nothing', () => {
    const createFile = vi.spyOn(editorFeature, 'createFile');
    const { result } = renderHook(
      () =>
        useCreateArtifactFlow({
          folder: '/srv/app',
          pathFor: (name) => `.claude/commands/${name}.md`,
          contentFor: () => 'content',
          onCreated: () => undefined,
        }),
      { wrapper: providers() },
    );

    act(() => {
      result.current.confirm();
    });

    expect(createFile).not.toHaveBeenCalled();
  });
});
