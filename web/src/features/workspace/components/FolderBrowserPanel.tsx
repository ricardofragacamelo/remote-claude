import { useId } from 'react';
import type { MouseEvent } from 'react';
import { ChevronRight, Folder, FolderSymlink } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ListStatus } from '@/shared/components/ListStatus';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils';
import type { BrowserOption, FolderBrowser } from '../hooks/useFolderBrowser';

export interface FolderBrowserPanelProps {
  readonly browser: FolderBrowser;
  readonly listRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * The browsing UI shared by every dialog built on {@link useFolderBrowser}: the crumbs, the "show
 * hidden" toggle, the filter badge, the truncated note, and the listbox itself with its own loading,
 * error and empty states.
 *
 * Extracted out of `OpenFolderDialog` (plan 06) when the plugins screen of plan 13 (B-29) needed a
 * second dialog built on the same hook, for its local-plugin path field — never a path typed loose.
 * A second, hand-copied implementation of this exact walk-by-crumbs listbox would have been the same
 * code drifting in two places, the kind of duplication `pnpm lint:dup` exists to catch; this is the
 * one implementation both dialogs render, each keeping only what is its own (header, footer, the
 * "Open"/"Choose" button, `OpenFolderDialog`'s extra allowlist help toggle).
 */
export function FolderBrowserPanel({
  browser,
  listRef,
}: FolderBrowserPanelProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <>
      <Crumbs browser={browser} />

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={browser.showHidden}
            onChange={(event) => {
              browser.setShowHidden(event.target.checked);
            }}
          />
          {t('workspace.dialog.showHidden')}
        </label>
        {browser.filter !== '' && (
          <span className="flex items-center gap-2" aria-live="polite">
            {t('workspace.dialog.filter', { filter: browser.filter })}
            <Button
              variant="outline"
              className="h-7 px-2"
              onClick={() => {
                browser.setFilter('');
                listRef.current?.focus();
              }}
            >
              {t('workspace.dialog.clearFilter')}
            </Button>
          </span>
        )}
      </div>

      {browser.truncated && (
        <p role="status" className="text-sm text-muted-foreground">
          {t('workspace.dialog.truncated')}
        </p>
      )}

      <Listing browser={browser} listRef={listRef} />
    </>
  );
}

/** From the roots to the folder on screen. It never has a step above a root. */
function Crumbs({ browser }: { readonly browser: FolderBrowser }): React.JSX.Element {
  const { t } = useTranslation();
  const last = browser.crumbs.length - 1;

  return (
    <nav aria-label={t('workspace.dialog.breadcrumb')}>
      <ol className="flex flex-wrap items-center gap-1 text-sm">
        <li>
          <CrumbButton
            label={t('workspace.dialog.roots')}
            isCurrent={last === -1}
            onClick={() => {
              browser.goTo(-1);
            }}
          />
        </li>
        {browser.crumbs.map((crumb, depth) => (
          <li key={crumb.path} className="flex items-center gap-1">
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            <CrumbButton
              label={crumb.name}
              isCurrent={depth === last}
              onClick={() => {
                browser.goTo(depth);
              }}
            />
          </li>
        ))}
      </ol>
    </nav>
  );
}

interface CrumbButtonProps {
  readonly label: string;
  readonly isCurrent: boolean;
  onClick(): void;
}

function CrumbButton({ label, isCurrent, onClick }: CrumbButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={cn(
        'rounded px-1 underline-offset-4 hover:underline',
        isCurrent && 'font-semibold',
      )}
      aria-current={isCurrent ? 'location' : undefined}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

interface ListingProps {
  readonly browser: FolderBrowser;
  readonly listRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * The list, and the three states that are not a list.
 *
 * The listbox stays on screen through all of them, so the focus is never dropped on the floor when
 * a folder turns out to be empty or unreadable — `Backspace` still goes up from there. What is not
 * an option is said beside it, never inside it.
 */
function Listing({ browser, listRef }: ListingProps): React.JSX.Element {
  const { t } = useTranslation();
  const id = useId();
  const here = browser.crumbs.at(-1)?.name ?? t('workspace.dialog.roots');

  const choose = (event: MouseEvent<HTMLDivElement>): void => {
    const index = Number(
      (event.target as HTMLElement).closest<HTMLElement>('[data-index]')?.dataset['index'],
    );
    const option = browser.options[index];

    if (option !== undefined) {
      browser.enter(option);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-2">
      <div
        ref={listRef}
        role="listbox"
        tabIndex={0}
        aria-label={t('workspace.dialog.listLabel', { folder: here })}
        aria-busy={browser.isLoading}
        aria-activedescendant={browser.active === -1 ? undefined : `${id}-${browser.active}`}
        className="flex max-h-72 flex-col overflow-y-auto rounded focus-visible:outline-2"
        onKeyDown={browser.onKeyDown}
        onClick={choose}
      >
        {!browser.isLoading &&
          browser.error === null &&
          browser.options.map((option, index) => (
            <Option
              key={option.path}
              id={`${id}-${index}`}
              index={index}
              option={option}
              isActive={index === browser.active}
            />
          ))}
      </div>

      <ListState browser={browser} />
    </div>
  );
}

/** Loading, failed, empty, or narrowed to nothing — whatever the list is, when it is not rows. */
function ListState({ browser }: { readonly browser: FolderBrowser }): React.JSX.Element {
  const { t } = useTranslation();
  const onRoots = browser.crumbs.length === 0;
  const narrowedToNothing =
    !browser.isLoading &&
    browser.error === null &&
    !browser.isEmpty &&
    browser.options.length === 0;

  return (
    <>
      <ListStatus
        rows={4}
        isLoading={browser.isLoading}
        loadingLabel={t('workspace.dialog.loading')}
        error={browser.error}
        onRetry={browser.reload}
        isEmpty={browser.isEmpty}
        emptyTitle={onRoots ? t('workspace.dialog.noRootsTitle') : t('workspace.dialog.emptyTitle')}
        emptyDescription={
          onRoots
            ? t('workspace.dialog.noRootsDescription')
            : t('workspace.dialog.emptyDescription')
        }
      />
      {narrowedToNothing && (
        <p className="text-sm text-muted-foreground">
          {t('workspace.dialog.noMatch', { filter: browser.filter })}
        </p>
      )}
    </>
  );
}

interface OptionProps {
  readonly id: string;
  readonly index: number;
  readonly option: BrowserOption;
  readonly isActive: boolean;
}

function Option({ id, index, option, isActive }: OptionProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div
      id={id}
      role="option"
      aria-selected={isActive}
      // Named in one sentence, so a screen reader says the folder first and what kind it is second.
      aria-label={
        option.symlink ? t('workspace.dialog.symlinkOption', { name: option.name }) : undefined
      }
      data-index={index}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm',
        isActive && 'bg-muted',
        option.hidden && 'text-muted-foreground',
      )}
    >
      {option.symlink ? (
        <span className="flex items-center" title={t('workspace.dialog.symlink')}>
          <FolderSymlink className="size-4" aria-hidden />
        </span>
      ) : (
        <Folder className="size-4" aria-hidden />
      )}
      <span className="truncate">{option.name}</span>
    </div>
  );
}
