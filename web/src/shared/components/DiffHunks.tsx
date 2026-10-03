import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import type { Hunk, HunkLine } from '@/shared/lib/diff-hunk';
import { cn } from '@/shared/lib/utils';

export interface DiffHunksProps {
  readonly hunks: readonly Hunk[];

  /** What the whole diff is — its accessible name, translated. */
  readonly label: string;

  /** Past this many lines the diff shows folded, with the way to see all of it. */
  readonly foldAfter?: number | undefined;

  /** What goes on the header of each hunk — the way to reject it (plan 08, B-31). */
  readonly actions?: ((hunk: Hunk) => ReactNode) | undefined;
  readonly className?: string;
}

/** The colour of each kind of line — a token per role, never a literal shade. */
const LINE_STYLE: Readonly<Record<HunkLine['kind'], string>> = {
  context: 'text-muted-foreground before:content-["_"]',
  added: 'bg-diff-added text-foreground before:content-["+"]',
  removed: 'bg-diff-removed text-foreground before:content-["-"]',
};

/** The words a line is announced with — named in full so the i18n check sees each key. */
const LINE_NAMES: Readonly<Record<Exclude<HunkLine['kind'], 'context'>, string>> = {
  added: 'diff.line.added',
  removed: 'diff.line.removed',
};

/**
 * The hunks of a diff, line by line, with the line numbers of both sides — what Claude changed in a
 * file, in the chat, in the list of changes and in the card that asks (plan 08, F3).
 *
 * The sign of each line is drawn by the stylesheet and the kind is **said** to a screen reader: the
 * colour is never the only way to tell an added line from a removed one. Long diffs fold, and
 * unfolding shows every line — what is cut is said, never hidden.
 */
export function DiffHunks({
  hunks,
  label,
  foldAfter,
  actions,
  className,
}: DiffHunksProps): React.JSX.Element {
  const { t } = useTranslation();
  const [unfolded, setUnfolded] = useState(false);
  const total = hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0);
  const budget = foldAfter !== undefined && !unfolded ? Math.min(foldAfter, total) : total;
  const folds = budget < total;
  const visible = shownOf(hunks, budget);

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div
        role="group"
        aria-label={label}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the lines scroll sideways inside it on a narrow screen, and a region that scrolls must be reachable by keyboard (WCAG 2.1.1, axe scrollable-region-focusable; plan 08, S-268)
        tabIndex={0}
        className="overflow-x-auto rounded border border-border font-code text-ui-xs focus-visible:outline-2 focus-visible:outline-ring"
      >
        {visible.map(({ hunk, shown }) => {
          return shown.length === 0 ? null : (
            <section key={hunk.id} className="border-b border-border last:border-b-0">
              {actions !== undefined && (
                <div className="flex items-center justify-end gap-1 bg-muted px-2 py-0.5">
                  {actions(hunk)}
                </div>
              )}
              <ol>
                {numbered(hunk, shown).map(({ key, ...line }) => (
                  <Line key={key} {...line} t={t} />
                ))}
              </ol>
            </section>
          );
        })}
      </div>
      {folds && (
        <Button
          variant="outline"
          className="self-start"
          onClick={() => {
            setUnfolded(true);
          }}
        >
          {t('diff.hunks.showAll', { count: total })}
        </Button>
      )}
    </div>
  );
}

/** The lines of each hunk that fit in `budget`, in order — the rest folded away. */
function shownOf(
  hunks: readonly Hunk[],
  budget: number,
): { readonly hunk: Hunk; readonly shown: readonly HunkLine[] }[] {
  let left = budget;

  return hunks.map((hunk) => {
    const shown = hunk.lines.slice(0, Math.max(0, left));
    left -= shown.length;
    return { hunk, shown };
  });
}

interface NumberedLine extends HunkLine {
  readonly key: string;
  readonly oldNumber: number | null;
  readonly newNumber: number | null;
}

/** Each line with its number on the side it is on — a removed line has no new number. */
function numbered(hunk: Hunk, lines: readonly HunkLine[]): NumberedLine[] {
  let oldAt = hunk.oldStart;
  let newAt = hunk.newStart;

  return lines.map((line, index) => {
    const oldNumber = line.kind === 'added' ? null : oldAt++;
    const newNumber = line.kind === 'removed' ? null : newAt++;

    return { ...line, key: `${hunk.id}:${String(index)}`, oldNumber, newNumber };
  });
}

function Line({
  kind,
  text,
  oldNumber,
  newNumber,
  t,
}: Omit<NumberedLine, 'key'> & { readonly t: (key: string) => string }): React.JSX.Element {
  return (
    <li className="flex min-w-max">
      <span className="w-10 shrink-0 px-1 text-right text-muted-foreground select-none" aria-hidden>
        {oldNumber}
      </span>
      <span className="w-10 shrink-0 px-1 text-right text-muted-foreground select-none" aria-hidden>
        {newNumber}
      </span>
      <span className={cn('flex-1 pr-2 whitespace-pre before:pr-1', LINE_STYLE[kind])}>
        {kind !== 'context' && <span className="sr-only">{t(LINE_NAMES[kind])}</span>}
        {text}
      </span>
    </li>
  );
}
