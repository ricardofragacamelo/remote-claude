/** The slice of a store's state a mounted stack owns — the rest is whatever else the store keeps. */
export interface MountedStackSlice {
  /** The ids "on screen", the latest last — a palette mode with no prop for it reads this. */
  readonly mounted: readonly string[];
}

/**
 * One zustand action: `mount(id)` pushes `id` onto the stack until the function it returns is
 * called, then takes it back out. The editor's own "which folder's editor is on screen"
 * (`editor/store/ui.store.ts`) and Quick Open's "which folder's workbench is"
 * (`search/store/ui.store.ts`) are the same stack, kept by each feature's own store rather than
 * shared state, since a feature never reads another's directly (plan 06 · D-06's own layering).
 *
 * @param set the store's own setter, exactly as `create((set) => ({ ... }))` hands it
 */
export function mountedStackAction<State extends MountedStackSlice>(
  set: (updater: (state: State) => Pick<State, 'mounted'>) => void,
): (id: string) => () => void {
  return (id) => {
    set((state) => ({ mounted: [...state.mounted, id] }));
    let mounted = true;

    return () => {
      if (mounted) {
        mounted = false;
        set((state) => {
          const at = state.mounted.lastIndexOf(id);
          return { mounted: state.mounted.filter((_, index) => index !== at) };
        });
      }
    };
  };
}
