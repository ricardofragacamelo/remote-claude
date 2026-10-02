import { createRegistry } from '@/shared/lib/registry';
import type { DiffSource } from '../types/editor';

/**
 * The sources of the provided sides of a diff — a session's changes (plan 08) register theirs at
 * load. A side whose source nobody registered fails to load, and the tab says so.
 */
export const diffSources = createRegistry<DiffSource>('diff sources');
