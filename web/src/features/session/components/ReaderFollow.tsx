import { useId, useState } from 'react';
import { ArrowDown, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/shared/components/IconButton';

import type { ConversationFollow } from '../hooks/useConversationFollow';
import type { TailControl } from '../hooks/useFollowTail';
import type { StreamMessage } from '../types/live-session';

/**
 * "Working in another client…" while the conversation seems to be worked on elsewhere — and that it
 * only seems so: the transcript records no state of a turn, so it is an inference, said as one
 * (plan 22, D-12). Never "in the editor": nothing says which client it is.
 *
 * The region is always there, empty when nothing works, so a screen reader hears it appear without
 * the focus moving (`aria-live="polite"`, S-86). The help — why it is an inference — is a press away,
 * beside it, and outside the region: it is read when asked for, not announced every time.
 */
export function WorkingElsewhere({ working }: { readonly working: boolean }): React.JSX.Element {
  const { t } = useTranslation();
  const [explained, setExplained] = useState(false);
  const help = useId();

  return (
    <div className="flex flex-col gap-1 empty:hidden">
      <div className="flex items-center gap-1">
        <p role="status" aria-live="polite" className="text-ui-xs text-muted-foreground">
          {working && t('history.follow.working')}
        </p>
        {working && (
          <IconButton
            icon={Info}
            label={t('history.follow.workingHelpLabel')}
            aria-expanded={explained}
            aria-controls={help}
            onClick={() => {
              setExplained(!explained);
            }}
          />
        )}
      </div>
      {working && explained && (
        <p id={help} className="text-ui-xs text-muted-foreground">
          {t('history.follow.workingHelp')}
        </p>
      )}
    </div>
  );
}

/** Why the conversation is not followed — it stays readable, and does not update by itself (S-81). */
export function FollowRefusal({
  refusal,
}: {
  readonly refusal: ConversationFollow['refusal'];
}): React.JSX.Element | null {
  const { t } = useTranslation();

  return refusal === null ? null : (
    <p className="rounded bg-muted p-2 text-xs" role="note">
      {t(refusal.messageKey, refusal.params)}
    </p>
  );
}

/** A message a person sees: of the conversation itself, with something drawn. */
function shown(message: StreamMessage): boolean {
  return (
    message.parentToolUseId === null && (message.blocks.length > 0 || message.streaming !== null)
  );
}

/** How many messages came after `mark` — the last one there was when the person left the end. */
function countAfter(messages: readonly StreamMessage[], mark: string | null): number {
  const visible = messages.filter(shown);
  const at = visible.findIndex((message) => message.messageId === mark);

  return mark === null || at === -1 ? 0 : visible.length - 1 - at;
}

/** The last message a person sees, or `null` with none. */
function lastOf(messages: readonly StreamMessage[]): string | null {
  return messages.findLast(shown)?.messageId ?? null;
}

/**
 * "N new" — at the bottom of a conversation scrolled up while it grows (plan 22, B-23, S-84).
 *
 * *N* counts **messages**, not blocks: a thinking and an answer of one reply are one. It counts from
 * the last message there was when the person left the end, so an earlier page read meanwhile — which
 * goes before — is never counted as new. Pressed, it goes to the end, and is gone.
 */
export function NewerPill({
  tail,
  messages,
}: {
  readonly tail: TailControl;
  readonly messages: readonly StreamMessage[];
}): React.JSX.Element | null {
  const { t } = useTranslation();
  const [left, setLeft] = useState<{ following: boolean; mark: string | null }>(() => ({
    following: tail.following,
    mark: tail.following ? null : lastOf(messages),
  }));

  // The person left the end, or came back to it: where they left it is where counting begins.
  if (left.following !== tail.following) {
    setLeft({ following: tail.following, mark: tail.following ? null : lastOf(messages) });
  }

  const count = tail.following ? 0 : countAfter(messages, left.mark);
  // Two keys and not a plural: "1 nova" is not "1 novas", and the catalogues hold no plural forms.
  const newer = count === 1 ? t('history.follow.newerOne') : t('history.follow.newer', { count });

  return count === 0 ? null : (
    <div className="pointer-events-none sticky bottom-2 flex justify-center">
      <button
        type="button"
        aria-label={t('history.follow.newerLabel', { newer })}
        className="pointer-events-auto inline-flex min-h-touch items-center gap-1 rounded-full border border-border bg-background px-3 text-ui-sm shadow-sm md:min-h-0 md:py-1"
        onClick={tail.toEnd}
      >
        <ArrowDown aria-hidden className="size-3.5" />
        {newer}
      </button>
    </div>
  );
}
