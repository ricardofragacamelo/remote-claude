import type { MessageBlock } from '../types/live-session';

/** The label of a thinking: a translation key, and what it is filled with. */
export interface ThinkingLabel {
  /** One of `sessions.thinking.*`. */
  readonly key: string;
  readonly params: Readonly<Record<string, string | number>>;
}

/** Seconds below a minute; minutes and seconds from there on — as the turn's own clock says it. */
function durationOf(
  milliseconds: number,
  keys: { readonly seconds: string; readonly minutes: string },
): ThinkingLabel {
  const seconds = Math.round(milliseconds / 1_000);

  return seconds < 60
    ? { key: keys.seconds, params: { seconds } }
    : {
        key: keys.minutes,
        params: {
          minutes: Math.floor(seconds / 60),
          seconds: String(seconds % 60).padStart(2, '0'),
        },
      };
}

/**
 * What the summary line of a thinking says (plan 22, B-27): "Thinking…" while it arrives; that it
 * was hidden, for a thinking the API redacted; how long it took, when the stream measured it; how
 * long **at most**, when the history's instants bound it (D-14); and otherwise only that it thought.
 * A thinking the model omitted is still "Thought" — a label of thinking, never a notice of absence.
 *
 * @param thinkingMs how long the stream measured it — `null` when it did not
 */
export function thinkingLabel(
  block: MessageBlock,
  thinkingMs: number | null,
  streaming: boolean,
): ThinkingLabel {
  if (streaming) {
    return { key: 'sessions.thinking.live', params: {} };
  }

  if (block.kind === 'redactedThinking') {
    return { key: 'sessions.thinking.hidden', params: {} };
  }

  if (thinkingMs !== null) {
    return durationOf(thinkingMs, {
      seconds: 'sessions.thinking.took',
      minutes: 'sessions.thinking.tookMinutes',
    });
  }

  return block.atMostMs === undefined
    ? { key: 'sessions.thinking.done', params: {} }
    : durationOf(block.atMostMs, {
        seconds: 'sessions.thinking.tookUpTo',
        minutes: 'sessions.thinking.tookUpToMinutes',
      });
}
