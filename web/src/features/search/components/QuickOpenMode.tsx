import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { executeCommand } from '@/features/commands';
import type { PaletteModeProps } from '@/features/commands';
import { openAndRecentFiles, openFile } from '@/features/editor';
import type { OpenFileOptions } from '@/features/editor';
import { CommandEmpty, CommandItem } from '@/shared/components/ui/command';
import { useFileFinder } from '../hooks/useFileFinder';
import { useQuickOpenFolder } from '../hooks/useQuickOpenFolder';
import { quickOpenInputOf } from '../lib/quick-open-query';
import { HighlightedText } from './HighlightedText';
import { QuickOpenHelp } from './QuickOpenHelp';

/** No single file-tree walk needs more than this to be useful — the rest is what `truncated` says. */
const LIMIT = 100;

/** The i18n catalogue never nests past three segments (plan 28, B-39) — flattened, not `truncated.${reason}`. */
function truncatedKeyOf(reason: 'limit' | 'timeout'): string {
  return reason === 'limit'
    ? 'search.quickOpen.truncatedLimit'
    : 'search.quickOpen.truncatedTimeout';
}

function openAt(folder: string, path: string, line: number | null, toSide: boolean): void {
  const options: OpenFileOptions = {
    preview: true,
    ...(toSide ? { toSide: true } : {}),
    ...(line === null ? {} : { line }),
  };
  openFile(folder, path, options);
}

/** The "go to line" item — forwarded to the editor's own, never reimplemented (S-107). */
function GoToLineItem({ pick }: Pick<PaletteModeProps, 'pick'>): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <CommandItem
      value="search.quickOpen.goToLine"
      onSelect={() => {
        pick(() => {
          void executeCommand('editor.goToLine', t);
        });
      }}
    >
      {t('search.quickOpen.goToLine')}
    </CommandItem>
  );
}

function QuickOpenResults({
  folder,
  search,
  line,
  active,
  pick,
}: {
  readonly folder: string;
  readonly search: string;
  readonly line: number | null;
  readonly active: string;
  readonly pick: PaletteModeProps['pick'];
}): React.JSX.Element {
  const { t } = useTranslation();
  const prefer = useMemo(() => openAndRecentFiles(folder), [folder]);
  const finder = useFileFinder(folder, { query: search, kinds: ['file'], prefer, limit: LIMIT });
  const [helpOpen, setHelpOpen] = useState(false);

  // Read from an effect, never from the keydown handler's own closure — the handler is bound once
  // and must still see the latest search, not the one that was live when it was attached.
  const latest = useRef({ folder, active, line });
  useEffect(() => {
    latest.current = { folder, active, line };
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const { folder: liveFolder, active: liveActive, line: liveLine } = latest.current;
      if (liveActive === '') {
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        openAt(liveFolder, liveActive, liveLine, false);
      } else if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        pick(() => {
          openAt(liveFolder, liveActive, liveLine, true);
        });
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [pick]);

  if (finder.error !== null) {
    return (
      <CommandEmpty>
        {t('search.quickOpen.locateError', {
          folder,
          message: t(finder.error.messageKey, finder.error.params),
        })}
      </CommandEmpty>
    );
  }

  if (finder.entries.length === 0) {
    return (
      <CommandEmpty>
        {t(finder.isLoading ? 'search.quickOpen.loading' : 'search.quickOpen.noMatch')}
      </CommandEmpty>
    );
  }

  return (
    <>
      {finder.entries.map((entry) => (
        <CommandItem
          key={entry.path}
          value={entry.path}
          onSelect={() => {
            pick(() => {
              openAt(folder, entry.path, line, false);
            });
          }}
        >
          <HighlightedText text={entry.path} positions={entry.positions} />
        </CommandItem>
      ))}
      {finder.truncated !== null && (
        <p className="px-2 py-1.5 text-ui-sm text-muted-foreground">
          {t(truncatedKeyOf(finder.truncated.reason))}
        </p>
      )}
      <CommandItem
        value="search.quickOpen.helpItem"
        onSelect={() => {
          // Never through `pick` — the palette closing would unmount this mode, and its help
          // with it, before the sheet ever had a chance to show (plan 11, B-20, S-142).
          setHelpOpen(true);
        }}
      >
        {t('search.quickOpen.helpItem')}
      </CommandItem>
      <QuickOpenHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  );
}

/**
 * Quick Open (plan 11, B-14) — the palette's own empty-prefix mode (`Ctrl/Cmd+P`): empty shows the
 * tab's own recent and open files, typing searches by fuzzy match with the matched letters
 * highlighted (B-13's `useFileFinder`). Enter opens as a preview tab; `Ctrl/Cmd+Enter` opens it
 * beside; the right arrow opens it the same way without closing the palette, for a quick look at
 * several in a row. `file.ts:42` opens at that line; a bare `:42` is forwarded to the editor's own
 * "go to line" (S-107). `>` always wins the prefix match over this mode's own empty one, and
 * deleting it back to nothing returns here (S-108, `palette-filter.ts`'s `modeFor`).
 */
export function QuickOpenMode({ query, active, pick }: PaletteModeProps): React.JSX.Element {
  const { t } = useTranslation();
  const folder = useQuickOpenFolder();
  const input = quickOpenInputOf(query);

  if (folder === null) {
    return <CommandEmpty>{t('search.quickOpen.empty')}</CommandEmpty>;
  }

  if (input.kind === 'goToLine') {
    return <GoToLineItem pick={pick} />;
  }

  return (
    <QuickOpenResults
      folder={folder}
      search={input.query}
      line={input.line}
      active={active}
      pick={pick}
    />
  );
}
