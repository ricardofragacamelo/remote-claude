/** One line of a hunk, without its line break. */
export interface HunkLine {
  readonly kind: 'context' | 'added' | 'removed';
  readonly text: string;
}

/**
 * A run of changed lines with what surrounds them — as the backend computes it for what a session
 * of Claude changed (plan 08, F3), and as the card that asks previews an edit.
 */
export interface Hunk {
  readonly id: string;

  /** Where the hunk starts on each side, from 1. */
  readonly oldStart: number;
  readonly newStart: number;
  readonly lines: readonly HunkLine[];
}
