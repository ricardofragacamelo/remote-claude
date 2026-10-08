import type { ReactNode } from 'react';

/**
 * Text of a tool — what went in, what came out — kept as it was written, in a box of a fixed height
 * that scrolls inside when the text is longer (plan 08, B-17; plan 22, B-29).
 *
 * It takes the focus, because a box that scrolls must be reachable by keyboard: a whole output of six
 * hundred lines has nothing focusable inside it, and without the focus a person on a keyboard cannot
 * read past its first lines (WCAG 2.1.1; axe `scrollable-region-focusable`, which the e2e of plan 22
 * found on the OUT of a Bash call, S-127).
 */
export function ScrollingPre({
  children,
  label,
}: {
  readonly children: ReactNode;
  /** What it is, said to assistive technology — when what surrounds it does not say it already. */
  readonly label?: string;
}): React.JSX.Element {
  return (
    <pre
      aria-label={label}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the text scrolls inside the box, and a region that scrolls must be reachable by keyboard (WCAG 2.1.1, axe scrollable-region-focusable; plan 22, S-127)
      tabIndex={0}
      className="max-h-64 overflow-auto rounded bg-muted p-2 font-code text-ui-xs whitespace-pre-wrap focus-visible:outline-2 focus-visible:outline-ring"
    >
      {children}
    </pre>
  );
}
