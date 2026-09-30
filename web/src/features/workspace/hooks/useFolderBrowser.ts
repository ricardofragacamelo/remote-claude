import { useCallback, useState } from 'react';
import type { KeyboardEvent } from 'react';

import type { AppError } from '@/shared/api/errors';
import type { DirectoryQuery, Workspace } from '../types/workspace';
import { useDirectories } from './useDirectories';
import type { Directories } from './useDirectories';
import { useRoots } from './useRoots';

/** One step of the way from a root to the folder on screen. */
export interface Crumb {
  readonly path: string;
  /** The root's label for the first crumb, the folder's name for the others. */
  readonly name: string;
}

/** One row the dialog offers: a root, on the roots; a subfolder, anywhere else. */
export interface BrowserOption {
  readonly path: string;
  readonly name: string;
  readonly symlink: boolean;
  readonly hidden: boolean;
}

/** Everything the dialog shows, and every way it can move. */
export interface FolderBrowser {
  /** From the root to the folder on screen; empty on the roots. */
  readonly crumbs: readonly Crumb[];
  readonly options: readonly BrowserOption[];

  /** The option the keyboard is on, or `-1` when there is none. */
  readonly active: number;

  /** What was typed to narrow the list — a prefix of a name. */
  readonly filter: string;
  readonly showHidden: boolean;

  /** The server cut the listing at its ceiling; the filter now asks the server. */
  readonly truncated: boolean;

  readonly isLoading: boolean;
  readonly error: AppError | null;

  /** There is nothing here at all — not "the filter matched nothing". */
  readonly isEmpty: boolean;

  /** The folder "Open" opens: the one on screen, as the server resolved it. `null` on the roots. */
  readonly current: string | null;

  enter(option: BrowserOption): void;

  /** To a crumb by its depth: `0` is the root, `-1` the roots. Never above the root. */
  goTo(depth: number): void;
  up(): void;
  setShowHidden(value: boolean): void;
  setFilter(value: string): void;
  setActive(index: number): void;
  onKeyDown(event: KeyboardEvent<HTMLElement>): void;
  reload(): void;
}

/**
 * The state of the "Open folder" dialog: where it is, what it lists, and the keyboard.
 *
 * It climbs by the crumbs it walked down, **never by editing a path** — the backend refuses a `..`,
 * and a path this hook built would be a path nobody listed
 * (docs/architecture/backend/03-modules.md#as-rotas-http-do-workspace). Above the root there is only
 * the list of roots: the dialog never shows what is beside one.
 *
 * The filter is a prefix, matched here while the listing is whole. Once the server has cut a
 * listing at its ceiling, the prefix is sent to the server instead — matching locally would only
 * search what happened to fit ([06 · D-05](../../../../../docs/plans/06-workbench/decisions.md#d-05--teto-de-entradas-por-listagem)).
 *
 * @param startAt the root to open inside, or `null` to start on the roots
 */
export function useFolderBrowser(startAt: Workspace | null): FolderBrowser {
  const [crumbs, setCrumbs] = useState<readonly Crumb[]>(
    startAt === null ? [] : [{ path: startAt.path, name: startAt.label }],
  );
  const [showHidden, setShowHidden] = useState(false);
  const [filter, setFilterState] = useState('');
  const [active, setActiveState] = useState(0);

  const level = useLevel(crumbs.at(-1), showHidden, filter);
  const options = level.everything.filter((option) => startsWith(option.name, filter));
  const current = options.length === 0 ? -1 : Math.min(active, options.length - 1);

  const walk = useCallback((next: readonly Crumb[]) => {
    setCrumbs(next);
    setFilterState('');
    setActiveState(0);
  }, []);

  const enter = (option: BrowserOption): void => {
    walk([...crumbs, { path: option.path, name: option.name }]);
  };
  const goTo = (depth: number): void => {
    walk(crumbs.slice(0, Math.max(depth, -1) + 1));
  };
  const up = (): void => {
    goTo(crumbs.length - 2);
  };
  const setFilter = (value: string): void => {
    setFilterState(value);
    setActiveState(0);
  };

  const keys = new Map<string, (event: KeyboardEvent<HTMLElement>) => void>([
    ['ArrowDown', () => setActiveState(Math.min(current + 1, options.length - 1))],
    ['ArrowUp', (event) => (event.altKey ? up() : setActiveState(Math.max(current - 1, 0)))],
    ['Home', () => setActiveState(0)],
    ['End', () => setActiveState(options.length - 1)],
    ['Enter', () => enterActive(options[current], enter)],
    ['Backspace', () => (filter === '' ? up() : setFilter(filter.slice(0, -1)))],
  ]);

  return {
    crumbs,
    options,
    active: current,
    filter,
    showHidden,
    truncated: level.truncated,
    isLoading: level.isLoading,
    error: level.error,
    isEmpty:
      !level.isLoading && level.error === null && level.everything.length === 0 && filter === '',
    current: level.listed,
    enter,
    goTo,
    up,
    setShowHidden: (value) => {
      setShowHidden(value);
      setActiveState(0);
    },
    setFilter,
    setActive: setActiveState,
    onKeyDown: (event) => {
      const handle =
        keys.get(event.key) ?? (isTyping(event) ? () => setFilter(filter + event.key) : undefined);

      if (handle !== undefined) {
        event.preventDefault();
        handle(event);
      }
    },
    reload: level.reload,
  };
}

/** What one level of the dialog lists, before the filter narrows it. */
interface Level {
  readonly everything: readonly BrowserOption[];
  readonly isLoading: boolean;
  readonly error: AppError | null;
  readonly truncated: boolean;

  /** The folder on screen, as the server resolved it — `null` on the roots. */
  readonly listed: string | null;

  reload(): void;
}

/** The roots when there is no crumb, the folder of the last crumb otherwise. */
function useLevel(here: Crumb | undefined, showHidden: boolean, filter: string): Level {
  const roots = useRoots();
  const listing = useListing(here?.path ?? null, showHidden, filter);

  return here === undefined
    ? {
        everything: roots.roots.map((root) => ({
          path: root.path,
          name: root.label,
          symlink: false,
          hidden: false,
        })),
        isLoading: roots.isLoading,
        error: roots.error,
        truncated: false,
        listed: null,
        reload: roots.reload,
      }
    : listing;
}

/**
 * One folder's subfolders — whole when they fit, and asked by prefix once they did not.
 *
 * Both listings are keyed by what they were asked, so the unfiltered one stays cached while the
 * filtered one is read, and clearing the filter shows it again without a request.
 */
function useListing(path: string | null, hidden: boolean, filter: string): Level {
  const base = useDirectories(ask(path, hidden));
  const truncated = base.listing?.truncated === true;
  const prefix = truncated && filter !== '' ? filter : undefined;
  const narrowed = useDirectories(prefix === undefined ? null : ask(path, hidden, prefix));

  return levelOf(prefix === undefined ? base : narrowed, truncated, base.listing?.path ?? path);
}

/** The question for one folder, or none without a folder. */
function ask(path: string | null, hidden: boolean, prefix?: string): DirectoryQuery | null {
  return path === null ? null : { path, hidden, prefix };
}

/** A listing, as one level of the dialog. */
function levelOf(source: Directories, truncated: boolean, listed: string | null): Level {
  return {
    everything: source.listing?.entries ?? [],
    isLoading: source.isLoading,
    error: source.error,
    truncated,
    listed,
    reload: source.reload,
  };
}

/** Case-insensitive, as the list is sorted — `Docs` is found by typing `d`. */
function startsWith(name: string, prefix: string): boolean {
  return name.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase());
}

/** One printable character, typed without a modifier that makes it a shortcut. */
function isTyping(event: KeyboardEvent<HTMLElement>): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

/** `Enter` goes into the option the keyboard is on — when it is on one. */
function enterActive(
  option: BrowserOption | undefined,
  enter: (option: BrowserOption) => void,
): void {
  if (option !== undefined) {
    enter(option);
  }
}
