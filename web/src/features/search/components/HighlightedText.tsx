/** One run of `text`, highlighted or not. */
interface HighlightRun {
  readonly text: string;
  readonly matched: boolean;
}

/** `text` split into runs by `positions` (ascending, 0-based) — adjacent matched indices merge. */
function highlightedRuns(text: string, positions: readonly number[]): readonly HighlightRun[] {
  const matched = new Set(positions);
  const runs: HighlightRun[] = [];
  let current = '';
  let currentMatched: boolean | null = null;

  for (let index = 0; index < text.length; index += 1) {
    const isMatched = matched.has(index);
    if (currentMatched !== null && isMatched !== currentMatched) {
      runs.push({ text: current, matched: currentMatched });
      current = '';
    }
    current += text[index];
    currentMatched = isMatched;
  }
  if (current !== '' && currentMatched !== null) {
    runs.push({ text: current, matched: currentMatched });
  }

  return runs;
}

/** `text`, with the characters at `positions` marked — the locator's own highlight (plan 11, B-14). */
export function HighlightedText({
  text,
  positions,
  replacement,
}: {
  readonly text: string;
  readonly positions: readonly number[];

  /** The match's resolved text, struck through beside it (plan 11, B-16) — absent outside replace. */
  readonly replacement?: string;
}): React.JSX.Element {
  return (
    <>
      {highlightedRuns(text, positions).map((run, index) =>
        run.matched ? (
          replacement === undefined ? (
            <mark key={index} className="rounded-sm bg-transparent font-semibold text-foreground">
              {run.text}
            </mark>
          ) : (
            <span key={index}>
              <span className="rounded-sm bg-diff-removed text-foreground line-through">
                {run.text}
              </span>
              <span className="rounded-sm bg-diff-added font-semibold text-foreground">
                {replacement}
              </span>
            </span>
          )
        ) : (
          <span key={index}>{run.text}</span>
        ),
      )}
    </>
  );
}
