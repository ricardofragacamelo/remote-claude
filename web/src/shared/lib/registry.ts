/** What every registered thing declares: who it is, and where it goes. */
export interface RegistryEntry {
  readonly id: string;

  /** Smaller first. Two entries at the same position are ordered by id, so the order is stable. */
  readonly position: number;

  /**
   * Holds a place for somebody else to fill: the plan that owns it registers the same id later and
   * takes the place over (docs/architecture/web/03-ui-system.md#os-registros--onde-os-planos-seguintes-encaixam).
   */
  readonly placeholder?: boolean;
}

/** A list others add to, and the screens that show it read. */
export interface Registry<T extends RegistryEntry> {
  /**
   * Adds an entry — or takes over a placeholder with the same id.
   *
   * @throws {Error} an id already taken by an entry that is not a placeholder: two plans claiming the
   *   same place is a bug to see at load, not a silent winner
   * @returns the way to take it back out — which gives a held place back to its placeholder
   */
  register(entry: T): () => void;

  /** What is registered, in order. The same array until something changes. */
  entries(): readonly T[];

  /** Told whenever an entry comes or goes. Answers the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

/** Who is told when something changes, and the way to be told. */
export interface Listeners {
  /** Tells every listener. */
  notify(): void;

  /** Answers the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

/** The listeners of a store the shell keeps outside React — a registry, the commands. */
export function createListeners(): Listeners {
  const listeners = new Set<() => void>();

  return {
    notify() {
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function byPosition(left: RegistryEntry, right: RegistryEntry): number {
  return left.position - right.position || left.id.localeCompare(right.id);
}

/**
 * A registry: the shape the shell uses for everything the plans after it fill in — the global
 * navigation, the views of the activity bar, the tabs of the panel, the items of the status bar.
 *
 * Registering is declaring; the shell decides where and how it shows. What nobody registered does
 * not show — no link without a destination, no empty tab.
 *
 * @param name what to call it in an error
 */
export function createRegistry<T extends RegistryEntry>(
  name: string,
  initial: readonly T[] = [],
): Registry<T> {
  let entries: readonly T[] = [...initial].sort(byPosition);
  const listeners = createListeners();

  const publish = (next: readonly T[]): void => {
    entries = [...next].sort(byPosition);
    listeners.notify();
  };

  return {
    register(entry) {
      const taken = entries.find((existing) => existing.id === entry.id);

      if (taken !== undefined && taken.placeholder !== true) {
        throw new Error(`${name}: "${entry.id}" is already registered`);
      }

      publish([...entries.filter((existing) => existing !== taken), entry]);

      // Taken back out, an entry that had taken over a held place gives the place back: the next
      // plan to fill it finds it held, and the screen says what will live there again.
      return () => {
        if (entries.includes(entry)) {
          publish([
            ...entries.filter((existing) => existing !== entry),
            ...(taken === undefined ? [] : [taken]),
          ]);
        }
      };
    },

    entries: () => entries,
    subscribe: listeners.subscribe,
  };
}
