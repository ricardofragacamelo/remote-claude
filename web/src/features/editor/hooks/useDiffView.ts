import { useCallback } from 'react';

import type { CodeEditorEngine, DiffContent, ViewOptions } from '../types/code-editor';
import { useHosted } from './useHosted';

/**
 * A read-only diff in the element the returned ref is put on (B-38) — made again when its texts
 * change, and told when the preferences do.
 *
 * @returns the ref of the element the diff is made in
 */
export function useDiffView(
  engine: CodeEditorEngine,
  content: DiffContent,
  options: ViewOptions,
): (element: HTMLDivElement | null) => (() => void) | undefined {
  // Made again when the texts change.
  const make = useCallback(
    (host: HTMLDivElement, initial: ViewOptions) => engine.createDiffView(host, content, initial),
    [engine, content],
  );

  return useHosted(make, options)[1];
}
