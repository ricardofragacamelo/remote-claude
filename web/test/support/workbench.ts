import { vi } from 'vitest';
import { screen, within } from '@testing-library/react';

import { workbenchLocation } from '@/app/workbench-location';
import { useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { mountApp } from './app';
import type { MountedApp } from './app';
import { translator } from './render';
import { aListing, fakeWorkspaceApi, projects, scratch } from './workspace-api';
import type { TabServer, WorkspaceRoutes } from './workspace-api';

const t = translator('en');

const session = {
  accessToken: 'a',
  userId: 'auth|42',
  expiresAt: Date.now() + 900_000,
  idToken: null,
};

/** The workbench of `folder`, signed in, over a server of tabs — every folder under a root opens. */
export function openWorkbench(
  folder: string,
  server: TabServer,
  extra: WorkspaceRoutes = {},
  search: { readonly session?: string; readonly conversation?: string } = {},
): MountedApp & { api: ReturnType<typeof fakeWorkspaceApi> } {
  useAuthStore.setState({ status: 'unknown', session: null });
  vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
  const api = fakeWorkspaceApi({
    roots: [scratch, projects],
    recent: [],
    resolve: (path) => ({ path, root: projects }),
    directories: (asked) =>
      aListing(projects, asked.get('path') ?? projects.path, ['a', 'b', 'c'].filter(Boolean)),
    ...server.routes,
    ...extra,
  });

  return { ...mountApp(workbenchLocation({ folder, ...search })), api };
}

/** The strip of folder tabs. */
export function strip(): HTMLElement {
  return screen.getByRole('navigation', { name: t('workbench.tabs.label') });
}

/** The tab of a folder, by what a person calls it — once the strip is on screen. */
export async function tabNamed(name: string | RegExp): Promise<HTMLElement> {
  const nav = await screen.findByRole('navigation', { name: t('workbench.tabs.label') });
  return within(nav).findByRole('button', { name });
}

/** The names of the tabs, in order. */
export function tabNames(): string[] {
  return within(strip())
    .getAllByRole('button')
    .filter((each) => each.hasAttribute('draggable'))
    .map((each) => each.textContent ?? '');
}

/**
 * Types into a field of the workbench from the keyboard alone.
 *
 * jsdom lays nothing out, so every element measures 0 × 0 at the origin — and the resizable panels
 * read every pointer there as a grab of one of their handles, holding the press that would have
 * focused the field. A person's pointer lands on the field; the test's focus does the same.
 */
export async function typeIn(
  user: { type(element: Element, text: string, options?: { skipClick?: boolean }): Promise<void> },
  field: HTMLElement,
  text: string,
): Promise<void> {
  field.focus();
  await user.type(field, text, { skipClick: true });
}

/**
 * The draft of the panel of Claude, on screen — what a folder tab shows before it has a session
 * (plan 08, B-33). By its role, so the drafts of the tabs that are not on screen are not counted.
 */
export function draftOnScreen(): Promise<HTMLElement> {
  return screen.findByRole('group', { name: t('sessions.draft.choices') });
}
