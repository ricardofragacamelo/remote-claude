import { useId, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { ChevronRight, Folder, FolderSymlink } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { ListStatus } from '@/shared/components/ListStatus';
import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { cn } from '@/shared/lib/utils';
import { useFolderBrowser } from '../hooks/useFolderBrowser';
import type { BrowserOption, FolderBrowser } from '../hooks/useFolderBrowser';
import type { Workspace } from '../types/workspace';
import { AllowlistHint } from './AllowlistHint';

export interface OpenFolderDialogProps {
  readonly open: boolean;
  onOpenChange(open: boolean): void;

  /** The root to start inside, or `null` to start on the roots. */
  readonly startAt: Workspace | null;

  /** Called with the folder to open — the one on screen, as the server resolved it. */
  onOpen(path: string): void;
}

/**
 * "Open folder": the roots on top, one level at a time below them, and nothing above a root.
 *
 * Built on the dialog primitive, which holds the focus inside, closes on `Esc` and gives the focus
 * back to whoever opened it. Everything inside is reset each time it opens — the browser lives in
 * the dialog's content, which unmounts on close.
 */
export function OpenFolderDialog({
  open,
  onOpenChange,
  startAt,
  onOpen,
}: OpenFolderDialogProps): React.JSX.Element {
  const { t } = useTranslation();
  const list = useRef<HTMLDivElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // The list takes the focus on arrival, so the keyboard works without a first Tab. Here and
        // not in an effect of the list: the dialog remembers who had the focus when it opened, to
        // give it back on close, and focusing earlier would make it remember the list itself.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          list.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('workspace.dialog.title')}</DialogTitle>
          <DialogDescription>{t('workspace.dialog.description')}</DialogDescription>
        </DialogHeader>
        <Browser
          listRef={list}
          startAt={startAt}
          onOpen={onOpen}
          onCancel={() => {
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

interface BrowserProps {
  readonly listRef: React.RefObject<HTMLDivElement | null>;
  readonly startAt: Workspace | null;
  onOpen(path: string): void;
  onCancel(): void;
}

/**
 * The inside of the dialog.
 *
 * The list is an ARIA listbox that keeps the focus while the keyboard moves through it
 * (`aria-activedescendant`): the arrows walk, `Enter` goes in, `Backspace` and `Alt+↑` go up, and
 * typing narrows by prefix. "Open" opens the folder on screen — nobody has to go into a subfolder to
 * open the one they are in.
 */
function Browser({ listRef: list, startAt, onOpen, onCancel }: BrowserProps): React.JSX.Element {
  const { t } = useTranslation();
  const browser = useFolderBrowser(startAt);
  const [helpOpen, setHelpOpen] = useState(false);
  const current = browser.current;

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
                list.current?.focus();
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

      <Listing browser={browser} listRef={list} />

      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          className="self-start"
          aria-expanded={helpOpen}
          onClick={() => {
            setHelpOpen(!helpOpen);
          }}
        >
          {t('workspace.dialog.helpToggle')}
        </Button>
        {helpOpen && (
          <div className="flex flex-col gap-2 text-sm">
            <p>{t('workspace.dialog.helpBody')}</p>
            <AllowlistHint />
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          {t('workspace.dialog.cancel')}
        </Button>
        <Button
          disabled={current === null}
          onClick={
            current === null
              ? undefined
              : () => {
                  onOpen(current);
                }
          }
        >
          {t('workspace.dialog.open')}
        </Button>
      </DialogFooter>
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
