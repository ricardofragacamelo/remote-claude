import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useRetainedOnRefusal } from '@/features/search/hooks/retained-on-refusal';

describe('useRetainedOnRefusal — plan 11, B-15/B-16', () => {
  it('shows the live files while there are some, remembering them', () => {
    const { result, rerender } = renderHook(
      (props: { files: readonly string[]; hasRequest: boolean; hasError: boolean }) =>
        useRetainedOnRefusal(props.files, props.hasRequest, props.hasError),
      { initialProps: { files: ['a.ts'], hasRequest: true, hasError: false } },
    );

    expect(result.current).toEqual(['a.ts']);

    rerender({ files: [], hasRequest: true, hasError: true });
    expect(result.current).toEqual(['a.ts']);
  });

  it('shows an empty answer as itself when it is not a refusal', () => {
    const { result } = renderHook(
      (props: { files: readonly string[]; hasRequest: boolean; hasError: boolean }) =>
        useRetainedOnRefusal(props.files, props.hasRequest, props.hasError),
      { initialProps: { files: [], hasRequest: true, hasError: false } },
    );

    expect(result.current).toEqual([]);
  });

  it('clears what it kept once there is no request left to retain it beside', () => {
    const { result, rerender } = renderHook(
      (props: { files: readonly string[]; hasRequest: boolean; hasError: boolean }) =>
        useRetainedOnRefusal(props.files, props.hasRequest, props.hasError),
      { initialProps: { files: ['a.ts'], hasRequest: true, hasError: false } },
    );
    rerender({ files: [], hasRequest: true, hasError: true });
    expect(result.current).toEqual(['a.ts']);

    rerender({ files: [], hasRequest: false, hasError: false });
    expect(result.current).toEqual([]);
  });
});
