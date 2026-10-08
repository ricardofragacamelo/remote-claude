import { Asterisk, Brain } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { thinkingLabel } from '../../lib/thinking-label';
import type { MessageBlock } from '../../types/live-session';

export interface ThinkingBlockProps {
  readonly block: MessageBlock;

  /** How long the model thought, when the stream measured it. */
  readonly thinkingMs: number | null;

  /** It is still arriving. */
  readonly streaming: boolean;
}

/**
 * The model's thinking, as the Claude Code shows it (plan 22, B-27): a thinking **summarised** in text
 * is in view, quiet, under "Thought" (D-15) — and can still be folded; one the model **omitted** says
 * "Thought", folded, and opened says the model did not show it; a **redacted** one says it was hidden,
 * and invents nothing (S-83). How long: measured on the stream, "at most" from the history (D-14), and
 * nothing without the instants.
 *
 * While it arrives it is **alive** (plan 09, B-22): "Thinking…", with the asterisk of the turn moving
 * — for who has not asked for less motion —, in the order of the conversation, between its tools.
 */
export function ThinkingBlock({
  block,
  thinkingMs,
  streaming,
}: ThinkingBlockProps): React.JSX.Element {
  const { t } = useTranslation();
  const hasText = block.kind === 'thinking' && block.text !== '';
  const label = thinkingLabel(block, thinkingMs, streaming);

  return (
    <details
      open={hasText}
      className="rounded-md border border-border px-2 py-1 text-ui-sm text-muted-foreground"
    >
      <summary className="flex cursor-pointer items-center gap-1">
        {streaming ? (
          <Asterisk className="size-3.5 text-primary motion-safe:animate-pulse" aria-hidden />
        ) : (
          <Brain className="size-3.5" aria-hidden />
        )}
        {t(label.key, label.params)}
      </summary>
      {hasText ? (
        <p className="mt-1 whitespace-pre-wrap italic opacity-80">{block.text}</p>
      ) : (
        <p className="mt-1 italic">{t('sessions.thinking.nothingShown')}</p>
      )}
    </details>
  );
}
