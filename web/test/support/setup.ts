import { webcrypto } from 'node:crypto';
import { afterEach, expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup, configure } from '@testing-library/react';
import { toHaveNoViolations } from 'jest-axe';
import { toast } from 'sonner';

import { usePalette } from '@/features/commands';
import { useNotifications } from '@/features/notifications';
import { usePingStore } from '@/features/diagnostics';
import { forgetPermissionQueues } from '@/features/permission';
import { forgetFolderTabs } from '@/features/workbench';
import { useFolderDialog } from '@/features/workspace';
import { useHelpPanel } from '@/shared/hooks/useHelpPanel';
import { useLocale } from '@/shared/hooks/useLocale';
import { useDensity } from '@/shared/hooks/useDensity';
import { useTheme } from '@/shared/hooks/useTheme';
import { forgetLiveSessions } from '@/features/session';
import { useOwnedSessionsStore } from '@/features/session/store/owned-sessions.store';

expect.extend(matchers);
// Accessibility is checked on every main screen, and a violation breaks the build: this product
// has a screen where somebody authorises a shell command — docs/architecture/web/06-testing.md.
expect.extend(toHaveNoViolations);

// jsdom ships a partial `crypto`; PKCE needs `subtle` and `randomUUID`, which the platform has.
if (globalThis.crypto?.subtle === undefined) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

// jsdom lays nothing out, and so has no `ResizeObserver`: the resizable panels of the workbench
// observe their own size. One that never reports is what a page with no layout would report.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}

// Nor does it scroll: the palette brings its active option into view as the arrows move it. What a
// page with no layout would do is nothing.
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {};
}

// Nor pointer capture: a toast captures the pointer to follow a swipe.
if (typeof Element.prototype.setPointerCapture !== 'function') {
  Element.prototype.setPointerCapture = function setPointerCapture(): void {};
  Element.prototype.releasePointerCapture = function releasePointerCapture(): void {};
  Element.prototype.hasPointerCapture = function hasPointerCapture(): boolean {
    return false;
  };
}

// How long `waitFor` and `findBy` wait for something that is asynchronous by design — a route that
// resolves, a load that answers. The library's second is a bet on the speed of the machine, and
// `verify:full` loses it: the backend's suite measures its coverage beside this one, containers
// and all. Five seconds only changes how long a true condition may take; a false one still fails
// (plan 05, cycle 18).
configure({ asyncUtilTimeout: 5_000 });

afterEach(() => {
  cleanup();

  // The sessions this browser opened outlive a screen by design, and so they would outlive a test:
  // one that opened a session would leave the next one owning it.
  useOwnedSessionsStore.setState({ owned: [] });

  // And so would the conversation and the questions of each session: one store per session, held for
  // as long as the page is (plan 06, S-181).
  forgetLiveSessions();
  forgetPermissionQueues();
  usePingStore.getState().reset();

  // What a visitor keeps — the theme, the language, the help left open, each tab's state and sizes —
  // is this browser's, and a test is a browser of its own (plan 06, B-17…B-21).
  forgetFolderTabs();
  localStorage.clear();
  useTheme.setState({ preference: 'system', theme: 'light' });
  useLocale.setState({ locale: 'en', picked: false });
  useDensity.setState({ density: 'compact' });
  delete document.documentElement.dataset['density'];
  useHelpPanel.setState({ open: false, section: null, hosts: 0 });

  // And the services of the shell, which live as long as the page (plan 06, F4).
  usePalette.getState().close();
  useFolderDialog.setState({ open: false, startAt: null, routes: null });
  useNotifications.setState({ pending: [], outbox: null, centerOpen: false, doNotDisturb: false });
  toast.dismiss();
});
