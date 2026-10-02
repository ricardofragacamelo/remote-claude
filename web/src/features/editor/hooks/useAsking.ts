import { useEditorState } from './useEditor';

/** The first open file with a question of `kind` waiting — one dialog at a time. */
export function useAsking(
  folder: string,
  kind: 'conflict' | 'sensitive' | 'recreate',
): string | null {
  return useEditorState(folder, (state) => {
    const doc = Object.values(state.docs).find((each) =>
      kind === 'conflict'
        ? each.conflict?.asking === true
        : kind === 'sensitive'
          ? each.sensitiveAsked
          : each.recreateAsked,
    );
    return doc?.path ?? null;
  });
}
