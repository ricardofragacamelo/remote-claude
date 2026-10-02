import type { Completions } from '../../hooks/useCompletions';
import { MentionList, SlashList } from './CompletionList';

/** The menu the cursor of the box opened — `@` or `/` — above the box. */
export function CompletionMenus({
  completions,
  onPick,
}: {
  readonly completions: Completions;
  onPick(index: number): void;
}): React.JSX.Element | null {
  if (completions.open === null) {
    return null;
  }

  return completions.open.kind === 'mention' ? (
    <MentionList
      id={completions.listId}
      menu={completions.mention}
      active={completions.active}
      onPick={onPick}
    />
  ) : (
    <SlashList
      id={completions.listId}
      menu={completions.slash}
      active={completions.active}
      onPick={onPick}
    />
  );
}
