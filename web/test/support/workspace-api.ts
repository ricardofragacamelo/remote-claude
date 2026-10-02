import { vi } from 'vitest';

import { api } from '@/shared/api/api';
import { AppError } from '@/shared/api/errors';

/** One root, as `GET /workspaces` answers it. */
export interface RootDto {
  readonly path: string;
  readonly label: string;
  readonly lastUsedAt: string | null;
}

export interface RecentDto {
  readonly path: string;
  readonly rootLabel: string | null;
  readonly lastOpenedAt: string;
  readonly pinned: boolean;
  readonly available: boolean;
}

export interface EntryDto {
  readonly name: string;
  readonly path: string;
  readonly hidden: boolean;
  readonly symlink: boolean;
}

export interface ListingDto {
  readonly path: string;
  readonly root: RootDto;
  readonly parent: string | null;
  readonly entries: readonly EntryDto[];
  readonly truncated: boolean;
}

export interface OpenFolderDto {
  readonly path: string;
  readonly rootLabel: string | null;
  readonly state: 'available' | 'notAllowed' | 'missing';
}

/** What a fake route answers: a value, a refusal, or a promise the test holds. */
export type Answer<T> = T | AppError | (() => Promise<T>);

/** The routes of the `workspace` module, each answered as the test says. Absent means "never". */
export interface WorkspaceRoutes {
  roots?: Answer<readonly RootDto[]>;
  resolve?: (path: string) => Answer<{ path: string; root: RootDto }>;
  directories?: (asked: URLSearchParams) => Answer<ListingDto>;
  recent?: Answer<readonly RecentDto[]>;
  pin?: (body: { path: string; pinned: boolean }) => Answer<undefined>;
  forget?: (path: string) => Answer<undefined>;
  openFolders?: Answer<readonly OpenFolderDto[]>;
  open?: (path: string) => Answer<OpenFolderDto>;
  close?: (path: string) => Answer<undefined>;
  order?: (paths: readonly string[]) => Answer<undefined>;

  /**
   * Any other `GET`, by its whole path — the lists of the Sessions view, a page of a conversation
   * (plan 08). `undefined` for a path it does not answer, which then never answers.
   */
  other?: (path: string) => Answer<unknown> | undefined;
}

/** Folder tabs the server keeps, changed by what the screen asks — for the specs of the tabs. */
export interface TabServer {
  readonly routes: Pick<WorkspaceRoutes, 'openFolders' | 'open' | 'close' | 'order'>;
  paths(): readonly string[];
}

/** One tab under `root`, available. */
export function aTab(path: string, rootLabel = 'Projects'): OpenFolderDto {
  return { path, rootLabel, state: 'available' };
}

/**
 * A server of folder tabs: opening adds one at the end, closing takes it out, a new order is kept
 * when it names the same set — and is refused with `CONFLICT` otherwise, as the backend does.
 */
export function aTabServer(initial: readonly OpenFolderDto[]): TabServer {
  let tabs = [...initial];

  return {
    routes: {
      openFolders: () => Promise.resolve([...tabs]),
      open: (path) => {
        const found = tabs.find((tab) => tab.path === path);
        if (found !== undefined) return found;
        const opened = aTab(path);
        tabs = [...tabs, opened];
        return opened;
      },
      close: (path) => {
        tabs = tabs.filter((tab) => tab.path !== path);
        return undefined;
      },
      order: (paths) => {
        const same = paths.length === tabs.length && tabs.every((tab) => paths.includes(tab.path));
        if (!same) {
          return refusal('CONFLICT', 'workspace.error.openFoldersOrderConflict');
        }
        tabs = paths.map((path) => tabs.find((tab) => tab.path === path)!);
        return undefined;
      },
    },
    paths: () => tabs.map((tab) => tab.path),
  };
}

export const scratch: RootDto = {
  path: '/tmp/remote-claude-workspaces',
  label: 'Scratch',
  lastUsedAt: null,
};
export const projects: RootDto = { path: '/srv/projects', label: 'Projects', lastUsedAt: null };

/** A refusal as `api.ts` hands it over. */
export function refusal(code: string, messageKey: string, params = {}): AppError {
  return new AppError(code, messageKey, 'trace-1', params);
}

/** A listing of `path` under `root`, with subfolders named `names`. */
export function aListing(
  root: RootDto,
  path: string,
  names: readonly string[],
  options: { truncated?: boolean; symlinks?: readonly string[] } = {},
): ListingDto {
  return {
    path,
    root,
    parent: path === root.path ? null : path.slice(0, path.lastIndexOf('/')),
    entries: names.map((name) => ({
      name,
      path: `${path}/${name}`,
      hidden: name.startsWith('.'),
      symlink: options.symlinks?.includes(name) ?? false,
    })),
    truncated: options.truncated ?? false,
  };
}

/** A request nobody answers: the screen stays loading. */
function never<T>(): Promise<T> {
  return new Promise(() => undefined);
}

function settle<T>(answer: Answer<T>): Promise<T> {
  if (answer instanceof AppError) {
    return Promise.reject(answer);
  }
  if (typeof answer === 'function') {
    return (answer as () => Promise<T>)();
  }
  return Promise.resolve(answer);
}

/** A route the test declared, answered — or, when it declared none, never. */
function reply<A extends unknown[], T>(
  route: ((...args: A) => Answer<T>) | undefined,
  ...args: A
): Promise<T> {
  return route === undefined ? never() : settle(route(...args));
}

/** A value route the test declared, answered — or, when it declared none, never. */
function value<T>(answer: Answer<T> | undefined): Promise<T> {
  return answer === undefined ? never() : settle(answer);
}

/** The search of a request path. */
function searchOf(path: string): URLSearchParams {
  return new URLSearchParams(path.slice(path.indexOf('?') + 1));
}

/**
 * Stands the backend's `workspace` routes in for the one HTTP client, route by route.
 *
 * Every other request never answers: a screen that asks for something this test is not about stays
 * loading, which is none of the test's business.
 *
 * @returns the spies, to assert what was asked
 */
export function fakeWorkspaceApi(routes: WorkspaceRoutes) {
  const get = vi.spyOn(api, 'get').mockImplementation((path: string) => {
    const route = path.split('?')[0];
    const asked = searchOf(path);

    if (route === '/workspaces') return value(routes.roots).then((workspaces) => ({ workspaces }));
    if (route === '/workspaces/resolve') return reply(routes.resolve, asked.get('path') ?? '');
    if (route === '/workspaces/directories') return reply(routes.directories, asked);
    if (route === '/workspaces/recent')
      return value(routes.recent).then((folders) => ({ folders }));
    if (route === '/workspaces/open-folders') {
      return value(routes.openFolders).then((folders) => ({ folders }));
    }
    return value(routes.other?.(path));
  });

  const post = vi
    .spyOn(api, 'post')
    .mockImplementation((path: string, body: unknown) =>
      path === '/workspaces/open-folders'
        ? reply(routes.open, (body as { path: string }).path)
        : never(),
    );

  const put = vi
    .spyOn(api, 'put')
    .mockImplementation((path: string, body: unknown) =>
      path === '/workspaces/open-folders/order'
        ? reply(routes.order, (body as { paths: readonly string[] }).paths)
        : reply(routes.pin, body as { path: string; pinned: boolean }),
    );

  const remove = vi
    .spyOn(api, 'delete')
    .mockImplementation((path: string) =>
      path.startsWith('/workspaces/open-folders')
        ? reply(routes.close, searchOf(path).get('path') ?? '')
        : reply(routes.forget, searchOf(path).get('path') ?? ''),
    );

  return { get, post, put, remove };
}
