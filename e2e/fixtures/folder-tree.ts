import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { callApi } from './api';
import type { AuthenticatedUser } from './auth';
import { endSession } from './history';
import { workspaceFor } from './live-session';
import type { WorkspaceRoot } from './live-session';
import type { ScenarioUser } from '../scenarios';

/**
 * A tree of folders inside a root of the allowlist, for the length of one test — plan 06, B-35.
 *
 * The workbench is about folders of the machine, so its end-to-end tests need real ones: nested,
 * hidden, reached through a symbolic link, and one that leaves the disk while its tab is open. The
 * backend runs on this machine and admits any directory inside a root it declares, so only the tree
 * under the root is made here — the root itself is read from the API, as every spec does.
 */

/** One tree, every folder of it as an absolute path. */
export interface FolderTree {
  /** The folder of the test, directly under the root: everything below lives in it. */
  readonly base: string;
  /** `base/alpha`, and `base/alpha/beta` below it — the way down a person takes. */
  readonly alpha: string;
  readonly beta: string;
  /** `base/gamma` — a second folder, for a second tab. */
  readonly gamma: string;
  /** `base/.hidden` — listed only when hidden folders are asked for. */
  readonly hidden: string;
  /** `base/inside` → `base/alpha`: a symbolic link that stays inside the root. */
  readonly inside: string;
  /** `base/escape` → {@link outside}: a symbolic link that leaves every root, and is never listed. */
  readonly escape: string;
  /** `base/doomed` — the folder a test removes while its tab is open. */
  readonly doomed: string;
  /** A folder outside every root of the allowlist. */
  readonly outside: string;
}

/**
 * Makes a tree under a root, and removes it after the test.
 *
 * Registers its own `afterEach`, so it is called at the top level of a spec.
 *
 * @returns a function that makes one, under the root given
 */
export function folderTrees(): (root: string) => FolderTree {
  const made: string[] = [];

  test.afterEach(() => {
    for (const folder of made.splice(0)) {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  return (root) => {
    const base = path.join(root, `e2e-${randomUUID()}`);
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-e2e-outside-'));
    made.push(base, outside);

    const tree: FolderTree = {
      base,
      alpha: path.join(base, 'alpha'),
      beta: path.join(base, 'alpha', 'beta'),
      gamma: path.join(base, 'gamma'),
      hidden: path.join(base, '.hidden'),
      inside: path.join(base, 'inside'),
      escape: path.join(base, 'escape'),
      doomed: path.join(base, 'doomed'),
      outside,
    };

    for (const folder of [tree.beta, tree.gamma, tree.hidden, tree.doomed]) {
      fs.mkdirSync(folder, { recursive: true });
    }
    fs.symlinkSync(tree.alpha, tree.inside);
    fs.symlinkSync(outside, tree.escape);

    return tree;
  };
}

/** The folder tabs of a user, in order, as the server keeps them. */
export async function tabsOf(user: AuthenticatedUser): Promise<string[]> {
  const response = await callApi(user, '/workspaces/open-folders');
  expect(response.status).toBe(200);

  const body = (await response.json()) as { folders: readonly { path: string }[] };
  return body.folders.map((folder) => folder.path);
}

/**
 * Starts every test with no folder tab, and ends it the same way — never touching a session.
 *
 * A user holds at most eight tabs, and the welcome screen of a user with tabs sends them to the
 * active one (plan 06, S-05): a test that inherited another's tabs would be testing that one. The
 * sessions a test opened from a tab are its own to end, with {@link sessionsOpened}.
 *
 * Registers its own hooks, so it is called at the top level of a spec.
 */
export function withoutTabs(user: () => AuthenticatedUser): void {
  const closeAll = async (): Promise<void> => {
    for (const folder of await tabsOf(user())) {
      const response = await callApi(
        user(),
        `/workspaces/open-folders?${new URLSearchParams({ path: folder }).toString()}`,
        { method: 'DELETE' },
      );
      expect(response.status).toBe(204);
    }
  };

  test.beforeEach(closeAll);
  test.afterEach(closeAll);
}

/**
 * Sessions a test opened through the screen, ended after it.
 *
 * Closing a tab never ends its sessions (plan 06, D-11), and the backend holds a bounded number at
 * once: a spec that left them running would starve the specs after it.
 *
 * Registers its own `afterEach`, so it is called at the top level of a spec.
 *
 * @returns a function that notes one
 */
export function sessionsOpened(user: () => AuthenticatedUser): (sessionId: string) => void {
  const opened: string[] = [];

  test.afterEach(async () => {
    for (const sessionId of opened.splice(0)) {
      await endSession(user(), sessionId);
    }
  });

  return (sessionId) => {
    opened.push(sessionId);
  };
}

/** What a spec of the workbench works with: its user, trees under the root, and tabs to open. */
export interface WorkbenchSuite {
  /** The user the suite signed in, once `beforeAll` has run. */
  user(): AuthenticatedUser;
  /** A tree of folders of this test, under the root this user may open. */
  tree(): FolderTree;
  /** The roots this user may open, as the HTTP API lists them. */
  roots(): Promise<readonly WorkspaceRoot[]>;
  /** The label of the root every tree is made under, as the dialog lists it. */
  rootLabel(): Promise<string>;
  /** Records a folder as a tab on the server — the setup of a test about something else. */
  openTab(folder: string): Promise<void>;
}

/**
 * Everything a spec of the workbench starts with: signed in once, a tree of folders per test, and no
 * tab before or after any of them.
 *
 * Registers its own hooks, so it is called at the top level of a spec.
 */
export function workbenchSuite(scenarioUser: ScenarioUser): WorkbenchSuite {
  const context = workspaceFor(scenarioUser);
  const user = (): AuthenticatedUser => context().user;
  withoutTabs(user);
  const trees = folderTrees();

  const roots = async (): Promise<readonly WorkspaceRoot[]> => {
    const response = await callApi(user(), '/workspaces');
    expect(response.status).toBe(200);

    return ((await response.json()) as { workspaces: readonly WorkspaceRoot[] }).workspaces;
  };

  return {
    user,
    tree: () => trees(context().workspace),
    roots,
    rootLabel: async () =>
      String((await roots()).find((root) => root.path === context().workspace)?.label),
    openTab: async (folder) => {
      const response = await callApi(user(), '/workspaces/open-folders', {
        method: 'POST',
        body: { path: folder },
      });
      expect([200, 201]).toContain(response.status);
    },
  };
}
