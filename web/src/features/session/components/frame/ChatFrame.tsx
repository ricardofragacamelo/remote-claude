import { useRef } from 'react';
import type { ReactNode } from 'react';

import { useFollowTail } from '../../hooks/useFollowTail';
import type { ScrollKeeper } from '../../hooks/useFollowTail';

export interface ChatFrameProps {
  /** What the frame is, said to assistive technology — the session, the draft, the conversation. */
  readonly label: string;

  /** What stays above the conversation, whatever is scrolled. */
  readonly header?: ReactNode;

  /** What scrolls: the conversation, or what stands in for it — the changes, the hints of a draft. */
  readonly children: ReactNode;

  /** What stays below, always in view: the box, and what stops or waits on the next prompt. */
  readonly dock: ReactNode;

  /** Where the conversation was left, and that it follows its end — `null` for what does not. */
  readonly keeper?: ScrollKeeper | null;
}

/**
 * The frame of every conversation of the panel (plan 09, B-05): a header that stays, the
 * conversation that scrolls, and the box anchored under it — in any width of the panel, on a phone
 * and with its keyboard open. Only the middle scrolls: it is the **one** scroller of the panel, and
 * what scrolls in it never reaches the page (`overscroll-contain`).
 *
 * The frame is a size container: the box grows up to a share of the frame's height (D-04) and the
 * conversation keeps an area in view however much is written. When the frame is short, the box is
 * what stays whole: the header gives up its room first — it has a ceiling, and scrolls under it.
 */
export function ChatFrame({
  label,
  header,
  children,
  dock,
  keeper = null,
}: ChatFrameProps): React.JSX.Element {
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  useFollowTail(scroller, content, keeper);

  return (
    <section
      aria-label={label}
      data-chat-frame
      className="grid min-h-0 flex-1 grid-rows-[minmax(0,auto)_minmax(0,1fr)_auto] [container-type:size]"
    >
      <div className="flex max-h-[25cqh] min-h-0 min-w-0 flex-col gap-2 overflow-y-auto px-3 not-empty:pt-2">
        {header}
      </div>
      <div
        ref={scroller}
        data-chat-scroller
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the conversation scrolls here, and with nothing focusable inside (a draft's hints) a region that scrolls must still be reachable by keyboard (WCAG 2.1.1, axe scrollable-region-focusable; plan 09, validation cycle 6)
        tabIndex={0}
        // Positioned: what is placed absolutely inside the conversation — the text only a screen
        // reader reads — is clipped by it, and never stretches the panel (plan 09, S-05).
        className="relative min-h-0 min-w-0 overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <div ref={content} className="flex min-w-0 flex-col gap-3 p-3">
          {children}
        </div>
      </div>
      {/* Positioned, for the same reason as the scroller: what only a screen reader reads stays in. */}
      <div className="relative flex min-w-0 flex-col gap-2 border-t border-border p-3 empty:hidden">
        {dock}
      </div>
    </section>
  );
}
