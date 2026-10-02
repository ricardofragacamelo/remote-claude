import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { workbenchLocation } from '@/app/workbench-location';
import { useAuthStore } from '@/features/auth';
import * as authService from '@/features/auth/services/auth.service';
import { setEngineLoader } from '@/features/editor/lib/engine-loader';
import { releaseFolderTabs } from '@/features/workbench/store/folder-tab.store';
import { useTheme } from '@/shared/hooks/useTheme';
import { wsClient } from '@/shared/api/ws';
import { mountApp } from '../../../support/app';
import { editorOf, pressSave, typeInto } from '../../../support/editor';
import { fakeDisk, refused } from '../../../support/editor-disk';
import { installFakeWebSocket } from '../../../support/fake-websocket';
import { translator } from '../../../support/render';
import { aViewport } from '../../../support/viewport';
import { tabNamed } from '../../../support/workbench';
import {
  aListing,
  aTab,
  aTabServer,
  fakeWorkspaceApi,
  projects,
  scratch,
} from '../../../support/workspace-api';
import type { TabServer } from '../../../support/workspace-api';

const t = translator('en');
const APP = `${projects.path}/app`;
const PKG = `${projects.path}/app/pkg`;

const session = {
  accessToken: 'a',
  userId: 'auth|42',
  expiresAt: Date.now() + 900_000,
  idToken: null,
};

beforeEach(() => {
  installFakeWebSocket();
});

afterEach(() => {
  wsClient.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** The app on `/workbench?folder=…&file=…`, signed in, over a server of tabs and a disk. */
function openAt(
  folder: string,
  file: string | undefined,
  server: TabServer,
  files: Record<string, string> = {},
) {
  useAuthStore.setState({ status: 'unknown', session: null });
  vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
  fakeWorkspaceApi({
    roots: [scratch, projects],
    recent: [],
    resolve: (path) => ({ path, root: projects }),
    directories: (asked) => aListing(projects, asked.get('path') ?? projects.path, []),
    ...server.routes,
  });
  const disk = fakeDisk(APP, files);
  const pkg = fakeDisk(PKG, {}, { disk, prefix: 'pkg/' });
  const mounted = mountApp(workbenchLocation(file === undefined ? { folder } : { folder, file }));

  return { ...mounted, disk, pkg };
}

describe('the active file in the address — plan 07, S-10, S-11, S-216, S-217', () => {
  it('opens the folder with the file a link names, active (S-10)', async () => {
    const { search } = openAt(APP, 'src/a.ts', aTabServer([aTab(APP)]), {
      'src/a.ts': 'from the link',
    });

    expect(await editorOf('a.ts')).toHaveValue('from the link');
    expect(search()).toMatchObject({ folder: APP, file: 'src/a.ts' });
  });

  it('shows the server’s refusal where the editor would be for a file climbing out of the folder (S-11)', async () => {
    const server = aTabServer([aTab(APP)]);
    const mounted = openAt(APP, '../x', server);
    mounted.disk.files.set('../x', {
      content: '',
      unreadable: refused('WORKSPACE_NOT_ALLOWED', 'session.error.workspaceNotAllowed', {
        path: '../x',
      }),
    });

    expect(
      await screen.findByText(t('editor.placeholder.deniedTitle', { path: '../x' })),
    ).toBeVisible();
    expect(
      screen.getByRole('complementary', { name: t('workbench.explorer.label') }),
    ).toBeVisible();
  });

  it('says a file of the address is not there (S-217)', async () => {
    openAt(APP, 'gone.ts', aTabServer([aTab(APP)]));

    expect(await screen.findByText(t('files.error.notFound', { path: 'gone.ts' }))).toBeVisible();
  });

  it('writes the file put on screen to the address, and a reload gives the tabs back (S-216)', async () => {
    const user = userEvent.setup();
    const server = aTabServer([aTab(APP)]);
    const first = openAt(APP, 'a.ts', server, { 'a.ts': 'a', 'b.ts': 'b' });
    await editorOf('a.ts');
    await act(async () => {
      const { openFile } = await import('@/features/editor');
      openFile(APP, 'b.ts');
    });
    await waitFor(() => {
      expect(first.search()).toMatchObject({ folder: APP, file: 'b.ts' });
    });
    await user.click(screen.getByRole('button', { name: 'a.ts' }));
    await waitFor(() => {
      expect(first.search()).toMatchObject({ file: 'a.ts' });
    });

    first.unmount();
    releaseFolderTabs();
    vi.restoreAllMocks();
    const again = openAt(APP, undefined, server, { 'a.ts': 'a', 'b.ts': 'b' });

    expect(await editorOf('a.ts')).toHaveValue('a');
    expect(screen.getByRole('button', { name: 'b.ts' })).toBeVisible();
    await waitFor(() => {
      expect(again.search()).toMatchObject({ folder: APP, file: 'a.ts' });
    });
  });
});

describe('no file on screen', () => {
  it('takes the file out of the address when the last tab closes', async () => {
    const user = userEvent.setup();
    const mounted = openAt(APP, 'a.ts', aTabServer([aTab(APP)]), { 'a.ts': 'a' });
    await editorOf('a.ts');

    await user.click(screen.getByRole('button', { name: t('editor.tab.close', { name: 'a.ts' }) }));
    await waitFor(() => {
      expect(mounted.search()).toEqual({ folder: APP });
    });
    expect(mounted.search()).not.toHaveProperty('file', 'a.ts');
  });
});

describe('two folder tabs and leaving the page — plan 07, B-40', () => {
  async function onBothTabs(files: Record<string, string>) {
    const server = aTabServer([aTab(APP), aTab(PKG)]);
    const mounted = openAt(APP, 'pkg/x.ts', server, files);
    await editorOf('x.ts');
    return mounted;
  }

  async function toTab(name: string): Promise<void> {
    const user = userEvent.setup();
    await user.click(await tabNamed(name));
  }

  it('reloads the clean copy in the other folder tab when it comes back on screen (S-259)', async () => {
    const mounted = await onBothTabs({ 'pkg/x.ts': 'one' });

    await toTab('pkg');
    await act(async () => {
      (await import('@/features/editor')).openFile(PKG, 'x.ts');
    });
    expect(await editorOf('x.ts')).toHaveValue('one');

    await toTab('app');
    const area = await editorOf('x.ts');
    typeInto(area, 'saved from app');
    pressSave(area);
    await waitFor(() => {
      expect(mounted.disk.files.get('pkg/x.ts')?.content).toBe('saved from app');
    });

    await toTab('pkg');
    await waitFor(async () => {
      expect(await editorOf('x.ts')).toHaveValue('saved from app');
    });
  });

  it('gives the second of two dirty copies the conflict — neither overwrites the other in silence (S-260)', async () => {
    const mounted = await onBothTabs({ 'pkg/x.ts': 'one' });
    typeInto(await editorOf('x.ts'), 'from app');

    await toTab('pkg');
    await act(async () => {
      (await import('@/features/editor')).openFile(PKG, 'x.ts');
    });
    const inPkg = await editorOf('x.ts');
    typeInto(inPkg, 'from pkg');
    pressSave(inPkg);
    await waitFor(() => {
      expect(mounted.disk.files.get('pkg/x.ts')?.content).toBe('from pkg');
    });

    await toTab('app');
    const inApp = await editorOf('x.ts');
    expect(inApp).toHaveValue('from app');
    expect(await screen.findByText(t('editor.external.other', { path: 'pkg/x.ts' }))).toBeVisible();
    pressSave(inApp);
    expect(
      await screen.findByRole('dialog', { name: t('editor.conflict.title', { name: 'x.ts' }) }),
    ).toBeVisible();
    expect(mounted.disk.files.get('pkg/x.ts')?.content).toBe('from pkg');
  });

  it('asks the browser before leaving with unsaved changes, and keeps no content in its storage (S-261)', async () => {
    await onBothTabs({ 'pkg/x.ts': 'top secret content' });
    typeInto(await editorOf('x.ts'), 'still secret content');

    const leaving = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leaving);

    expect(leaving.defaultPrevented).toBe(true);
    const kept = Object.keys(localStorage).map((key) => localStorage.getItem(key) ?? '');
    expect(kept.join('\n')).toContain('pkg/x.ts');
    expect(kept.join('\n')).not.toContain('secret');
  });

  it('lists the files with unsaved changes when closing their folder tab (S-262)', async () => {
    const user = userEvent.setup();
    await onBothTabs({ 'pkg/x.ts': 'one' });
    typeInto(await editorOf('x.ts'), 'mine');

    await toTab('pkg');
    fireEvent.contextMenu(await tabNamed('app'));
    await user.click(await screen.findByRole('menuitem', { name: t('workbench.tabAction.close') }));
    const dialog = await screen.findByRole('dialog', {
      name: t('workbench.close.titleOne', { name: 'app' }),
    });

    expect(within(dialog).getByText(t('workbench.close.unsaved'))).toBeVisible();
    expect(
      within(dialog).getByRole('list', { name: t('workbench.close.unsavedLabel') }),
    ).toHaveTextContent('pkg/x.ts');
  });

  it('keeps the tabs, the groups, the cursor and the unsaved buffer across a switch of folder tabs (S-263)', async () => {
    await onBothTabs({ 'pkg/x.ts': 'one\ntwo', 'pkg/y.ts': 'y' });
    await act(async () => {
      (await import('@/features/editor')).openFile(APP, 'pkg/y.ts', { toSide: true });
    });
    const area = await editorOf('x.ts');
    typeInto(area, 'one\ntwo\nthree');
    act(() => {
      area.setSelectionRange(5, 5);
      area.dispatchEvent(new Event('select'));
    });

    await toTab('pkg');
    await toTab('app');

    const back = await editorOf('x.ts');
    expect(back).toHaveValue('one\ntwo\nthree');
    expect(back.selectionStart).toBe(5);
    expect(
      screen.getByRole('region', { name: t('editor.group.label', { place: 2 }) }),
    ).toBeVisible();
  });
});

describe('the editor in the workbench — plan 07, B-31', () => {
  it('says the editor could not load, with "try again", and the tab carries on (S-205)', async () => {
    const user = userEvent.setup();
    const load = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))
      .mockResolvedValue((await import('@/features/editor/lib/plain-engine')).createPlainEngine());
    setEngineLoader('monaco', load);
    openAt(APP, 'a.ts', aTabServer([aTab(APP)]), { 'a.ts': 'a' });

    expect(await screen.findByText(t('editor.load.failed'))).toBeVisible();
    expect(
      screen.getByRole('complementary', { name: t('workbench.explorer.label') }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: t('common.action.retry') }));
    expect(await editorOf('a.ts')).toHaveValue('a');
  });

  it('is the simplified mode below md: a text area, no Monaco, targets of 44 px (S-206)', async () => {
    const user = userEvent.setup();
    aViewport('phone');
    const monaco = vi.fn();
    setEngineLoader('monaco', monaco);
    openAt(APP, 'a.ts', aTabServer([aTab(APP)]), { 'a.ts': 'a' });

    await user.click(await screen.findByRole('button', { name: t('workbench.mobile.editor') }));
    expect(await editorOf('a.ts')).toHaveValue('a');
    expect(monaco).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: t('editor.tab.close', { name: 'a.ts' }) }),
    ).toHaveClass('size-touch');
  });

  it('follows the theme, the moment it changes (S-207)', async () => {
    const plain = (await import('@/features/editor/lib/plain-engine')).createPlainEngine();
    const setTheme = vi.spyOn(plain, 'setTheme');
    setEngineLoader('monaco', () => Promise.resolve(plain));
    openAt(APP, 'a.ts', aTabServer([aTab(APP)]), { 'a.ts': 'a' });
    await editorOf('a.ts');

    expect(setTheme).toHaveBeenLastCalledWith('light');
    act(() => {
      useTheme.getState().setTheme('dark');
    });
    expect(setTheme).toHaveBeenLastCalledWith('dark');
  });

  it('puts Settings › Editor among the app’s settings', async () => {
    useAuthStore.setState({ status: 'unknown', session: null });
    vi.spyOn(authService, 'renewSession').mockResolvedValue(session);
    fakeWorkspaceApi({ roots: [scratch, projects], recent: [], openFolders: [] });
    mountApp('/settings/editor');

    expect(await screen.findByRole('group', { name: t('editor.settings.fontSize') })).toBeVisible();
  });
});
