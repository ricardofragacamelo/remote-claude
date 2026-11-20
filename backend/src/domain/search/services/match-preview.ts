/** A match's preview, and where the match itself falls inside it, in UTF-16 units. */
export interface MatchPreview {
  readonly text: string;
  readonly matchStart: number;
  readonly matchEnd: number;
}

/**
 * Crops [lineText] to a window of [contextChars] on each side of the match — a minified line of
 * five megabytes never becomes a five-megabyte response (S-66). The crop is by UTF-16 unit, the
 * same unit [matchStartColumn] and [matchEndColumn] are already in.
 */
export function matchPreviewOf(
  lineText: string,
  matchStartColumn: number,
  matchEndColumn: number,
  contextChars: number,
): MatchPreview {
  const start = Math.max(0, matchStartColumn - contextChars);
  const end = Math.min(lineText.length, matchEndColumn + contextChars);

  return {
    text: lineText.slice(start, end),
    matchStart: matchStartColumn - start,
    matchEnd: matchEndColumn - start,
  };
}
