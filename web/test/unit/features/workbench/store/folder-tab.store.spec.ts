import { describe, expect, it } from 'vitest';

import {
  FIRST_VIEW,
  folderTabStore,
  forgetFolderTab,
  forgetFolderTabs,
} from '@/features/workbench/store/folder-tab.store';

const A = '/srv/projects/a';
const B = '/srv/projects/a/sub';

describe('the state of a folder tab', () => {
  it('starts on the first view, the side bar open, the panel closed, Claude on a phone', () => {
    expect(folderTabStore(A).getState()).toMatchObject({
      view: FIRST_VIEW,
      sideBarOpen: true,
      panelOpen: false,
      mobileView: 'claude',
      sessionId: null,
    });
  });

  it('is one store per folder — a folder and its subfolder share nothing (S-98, S-99)', () => {
    folderTabStore(A).getState().pickView('search');
    folderTabStore(A).getState().showSession('S1');

    expect(folderTabStore(A)).toBe(folderTabStore(A));
    expect(folderTabStore(B).getState()).toMatchObject({ view: FIRST_VIEW, sessionId: null });
  });

  it('closes the side bar when the view already open is picked again, and opens it on another (S-111)', () => {
    const tab = folderTabStore(A);

    tab.getState().pickView(FIRST_VIEW);
    expect(tab.getState()).toMatchObject({ view: FIRST_VIEW, sideBarOpen: false });

    tab.getState().pickView(FIRST_VIEW);
    expect(tab.getState().sideBarOpen).toBe(true);

    tab.getState().pickView('search');
    expect(tab.getState()).toMatchObject({ view: 'search', sideBarOpen: true });
  });

  it('shows a view without ever closing the side bar — the phone’s way to pick', () => {
    const tab = folderTabStore(A);

    tab.getState().showView(FIRST_VIEW);
    tab.getState().showView(FIRST_VIEW);

    expect(tab.getState()).toMatchObject({ view: FIRST_VIEW, sideBarOpen: true });
  });

  it('toggles the side bar and the panel', () => {
    const tab = folderTabStore(A);

    tab.getState().toggleSideBar();
    tab.getState().togglePanel();
    expect(tab.getState()).toMatchObject({ sideBarOpen: false, panelOpen: true });

    tab.getState().toggleSideBar();
    tab.getState().togglePanel();
    expect(tab.getState()).toMatchObject({ sideBarOpen: true, panelOpen: false });
  });

  it('puts one view on a phone’s screen', () => {
    folderTabStore(A).getState().showMobile('editor');

    expect(folderTabStore(A).getState().mobileView).toBe('editor');
  });

  it('shows a session, and none', () => {
    const tab = folderTabStore(A);

    tab.getState().showSession('S1');
    expect(tab.getState()).toMatchObject({ sessionId: 'S1', conversationId: null });

    tab.getState().showSession(null);
    expect(tab.getState().sessionId).toBeNull();
  });

  it('shows a conversation read only, never beside a session — plan 08, B-10', () => {
    const tab = folderTabStore(A);
    tab.getState().showSession('S1');

    tab.getState().showConversation('C1');
    expect(tab.getState()).toMatchObject({ conversationId: 'C1', sessionId: null });

    tab.getState().showSession('S2');
    expect(tab.getState()).toMatchObject({ conversationId: null, sessionId: 'S2' });
  });

  it('takes a session from a link to be checked, and says so when it is not live — B-12', () => {
    const tab = folderTabStore(A);

    tab.getState().openLinkedSession('S9');
    expect(tab.getState()).toMatchObject({
      sessionId: 'S9',
      sessionFromLink: true,
      linkRefused: false,
    });

    tab.getState().refuseLink();
    expect(tab.getState()).toMatchObject({
      sessionId: null,
      sessionFromLink: false,
      linkRefused: true,
    });

    tab.getState().showConversation(null);
    expect(tab.getState().linkRefused).toBe(false);
  });

  it('starts over once the tab is closed, and all of them on a sign-out', () => {
    folderTabStore(A).getState().showSession('x');
    folderTabStore(B).getState().showSession('y');

    forgetFolderTab(A);
    expect(folderTabStore(A).getState().sessionId).toBeNull();
    expect(folderTabStore(B).getState().sessionId).toBe('y');

    forgetFolderTabs();
    expect(folderTabStore(B).getState().sessionId).toBeNull();
  });
});
