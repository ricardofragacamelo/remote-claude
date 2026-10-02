/** One value per folder tab, made on the first ask and dropped with the tab. */
export interface PerFolder<T> {
  /** The folder's own — the same one for everybody who asks, made on the first ask. */
  of(folder: string): T;

  /** The tab closed — or, for `null`, every tab went: its value goes with it. */
  forget(folder: string | null): void;
}

/**
 * State **of one folder tab**, keyed by the folder's real path — never one global for "the folder
 * on screen": two tabs show different things, and what one does is not the other's
 * (docs/architecture/web/04-state-and-data.md#estado-de-aba-de-pasta).
 */
export function perFolder<T>(create: () => T): PerFolder<T> {
  const values = new Map<string, T>();

  return {
    of(folder) {
      const existing = values.get(folder);

      if (existing !== undefined) {
        return existing;
      }

      const created = create();
      values.set(folder, created);
      return created;
    },
    forget(folder) {
      if (folder === null) {
        values.clear();
      } else {
        values.delete(folder);
      }
    },
  };
}
