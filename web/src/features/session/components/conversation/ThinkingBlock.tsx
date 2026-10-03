import { Asterisk, Brain } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { MessageBlock } from '../../types/live-session';

export interface ThinkingBlockProps {
  readonly block: MessageBlock;

  /** How long the model thought, when the stream measured it. */
  readonly thinkingMs: number | null;

  /** It is still arriving. */
  readonly streaming: boolean;
}

/** What the folded thinking says on its summary line — how long, or only that it thought. */
function summaryKey(block: MessageBlock, thinkingMs: number | null, streaming: boolean): string {
  if (streaming) return 'sessions.thinking.live';
  if (block.kind === 'redactedThinking' || block.text === '') return 'sessions.thinking.hidden';
  return thinkingMs === null ? 'sessions.thinking.done' : 'sessions.thinking.took';
}

/**
 * The model's thinking, **folded** by default (plan 08, D-17) — "thought for n s" when the stream
 * measured it, "thought" from the history, which keeps no time per block. A thinking the model
 * omitted or redacted says it existed and invents nothing (S-83).
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

  return (
    <details className="rounded-md border border-border px-2 py-1 text-ui-sm text-muted-foreground">
      <summary className="flex cursor-pointer items-center gap-1">
        {streaming ? (
          <Asterisk className="size-3.5 text-primary motion-safe:animate-pulse" aria-hidden />
        ) : (
          <Brain className="size-3.5" aria-hidden />
        )}
        {t(summaryKey(block, thinkingMs, streaming), {
          seconds: Math.round((thinkingMs ?? 0) / 1000),
        })}
      </summary>
      {hasText ? (
        <p className="mt-1 whitespace-pre-wrap">{block.text}</p>
      ) : (
        <p className="mt-1 italic">{t('sessions.thinking.nothingShown')}</p>
      )}
    </details>
  );
}
