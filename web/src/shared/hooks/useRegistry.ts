import { useSyncExternalStore } from 'react';

import type { Registry, RegistryEntry } from '@/shared/lib/registry';

/** What a registry holds, in order — and a render whenever that changes. */
export function useRegistry<T extends RegistryEntry>(registry: Registry<T>): readonly T[] {
  return useSyncExternalStore(registry.subscribe, registry.entries);
}
