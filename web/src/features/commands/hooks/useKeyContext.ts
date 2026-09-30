import { useEffect } from 'react';

import { enterKeyContext } from '../store/key-contexts';
import type { KeyContext } from '../types/command';

/** Makes a context's shortcuts live while the component is mounted — the workbench's, on screen. */
export function useKeyContext(context: KeyContext): void {
  useEffect(() => enterKeyContext(context), [context]);
}
