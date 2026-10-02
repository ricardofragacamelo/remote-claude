import { createRegistry } from '@/shared/lib/registry';
import type { RegistryEntry } from '@/shared/lib/registry';
import type { ContextItem } from '../types/context';

/**
 * Something an `@` offers besides the files of the folder — `@selection`, `@terminal` (plan 08,
 * B-48). A registry of the client: a plan that has something to offer registers it here, and the
 * composer is not changed for it — the terminal of plan 12 is one. A provider with nothing to give
 * right now is not shown (S-231).
 */
export interface MentionProvider extends RegistryEntry {
  /** What it is called after the `@` — matched against what was typed. */
  readonly keyword: string;

  /** Its name and what it adds, translated. */
  readonly labelKey: string;
  readonly descriptionKey: string;

  /** What it would add now in this folder tab, or `null` when it has nothing to give. */
  items(folder: string): readonly ContextItem[] | null;
}

export const mentionProviders = createRegistry<MentionProvider>('mention providers');

/** The providers that have something to give now, and whose keyword starts with what was typed. */
export function offeredProviders(
  providers: readonly MentionProvider[],
  folder: string,
  query: string,
): { readonly provider: MentionProvider; readonly items: readonly ContextItem[] }[] {
  const wanted = query.toLowerCase();

  return providers.flatMap((provider) => {
    if (!provider.keyword.startsWith(wanted)) {
      return [];
    }

    const items = provider.items(folder);
    return items === null || items.length === 0 ? [] : [{ provider, items }];
  });
}
