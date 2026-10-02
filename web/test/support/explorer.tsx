import { afterEach, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';

import { CommandHost, useKeyContext } from '@/features/commands';
import { ExplorerView } from '@/features/explorer';
import { ExplorerStatusItem } from '@/features/explorer/components/ExplorerStatusItem';
import { forgetExplorer } from '@/features/explorer/store/explorer.store';
import type { FolderTab } from '@/features/workbench';
import { folderWatches } from '@/shared/api/ws';
import type { FolderWatchSubscriber } from '@/shared/api/folder-watches';
import type { Locale } from '@/shared/i18n';
import { FakeFolder } from './files-api';
import type { FakeEntry, FakeFolderOptions } from './files-api';
import { render } from './render';

// The Explorer of each folder lives as long as the page — and so it would outlive a test: one that
// opened `src` would leave the next one with `src` open.
afterEach(() => {
  forgetExplorer(null);
});

/** The folder most Explorer specs open. */
export const APP = '/srv/projects/app';

/** A folder tab, available, as the workbench hands it to an item of the status bar. */
export function aFolderTab(path: string): FolderTab {
  return {
    path,
    name: path.slice(path.lastIndexOf('/') + 1),
    rootLabel: 'Projects',
    state: 'available',
    kept: true,
  };
}

/** The watches of the socket, faked: what each folder subscribed, and how many are held. */
export interface FakeWatches {
  subscriber(folder: string): FolderWatchSubscriber;
  held(folder: string): number;
  readonly watched: string[];
}

/** Stands the socket's folder watches in, so a test plays the server's side of `workspace.*`. */
export function fakeWatches(): FakeWatches {
  const subscribers = new Map<string, FolderWatchSubscriber[]>();
  const watched: string[] = [];

  vi.spyOn(folderWatches, 'watch').mockImplementation((folder, subscriber) => {
    watched.push(folder);
    subscribers.set(folder, [...(subscribers.get(folder) ?? []), subscriber]);

    return () => {
      subscribers.set(
        folder,
        (subscribers.get(folder) ?? []).filter((each) => each !== subscriber),
      );
    };
  });

  return {
    subscriber: (folder) => {
      const last = subscribers.get(folder)?.at(-1);

      if (last === undefined) {
        throw new Error(`nobody watches ${folder}`);
      }

      return last;
    },
    held: (folder) => subscribers.get(folder)?.length ?? 0,
    watched,
  };
}

/** The workbench's shortcuts live, as while the workbench is on screen. */
function WorkbenchKeys(): null {
  useKeyContext('workbench');
  return null;
}

/** The Explorer of a folder, as the workbench shows it — with the shell's commands and keys. */
export function ExplorerHarness({ folder }: { readonly folder: string }): React.JSX.Element {
  return (
    <>
      <WorkbenchKeys />
      <CommandHost />
      <ExplorerView folder={folder} />
      <ExplorerStatusItem tab={aFolderTab(folder)} />
    </>
  );
}

/** Opens the Explorer of `folder` over a fake disk. */
export function renderExplorer(
  tree: Readonly<Record<string, FakeEntry | string>>,
  options: FakeFolderOptions & { readonly folder?: string; readonly locale?: Locale } = {},
) {
  const folder = options.folder ?? APP;
  const disk = new FakeFolder(folder, tree, options).install();
  const watches = fakeWatches();
  const rendered = render(<ExplorerHarness folder={folder} />, options.locale);

  return { ...rendered, disk, watches, folder };
}

/** The tree, once it is on screen. */
export function theTree(): Promise<HTMLElement> {
  return screen.findByRole('tree');
}

/** A row of the tree by what it says. */
export async function row(name: string | RegExp): Promise<HTMLElement> {
  return within(await theTree()).findByRole('treeitem', { name });
}

/** Tells the explorer, as the server would, that the folder is followed. */
export function watching(watches: FakeWatches, folder = APP, again = false): void {
  act(() => {
    watches.subscriber(folder).onWatching(again);
  });
}
