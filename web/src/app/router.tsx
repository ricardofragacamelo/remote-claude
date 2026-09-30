import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';

import { CALLBACK_PATH } from '@/features/auth';
import { firstSectionId, settingsSections } from '@/features/settings';
import { AboutRoute } from './AboutRoute';
import { App } from './App';
import { AuditRoute, readAuditSearch } from './AuditRoute';
import { Callback } from './Callback';
import { DevicesRoute } from './DevicesRoute';
import { DiagnosticsRoute } from './DiagnosticsRoute';
import { FramedOutlet } from './FramedOutlet';
import { NotFoundRoute } from './NotFoundRoute';
import { RuleRoute } from './RuleRoute';
import { RulesRoute } from './RulesRoute';
import { SettingsRoute } from './SettingsRoute';
import { readWorkbenchSearch } from './workbench-location';
import { WorkbenchRoute } from './WorkbenchRoute';

/**
 * The routes.
 *
 * What is navigable lives in the URL, not in state — the test is whether pasting the link on
 * another device reproduces the screen. See docs/architecture/web/04-state-and-data.md.
 */
const rootRoute = createRootRoute({ component: Outlet, notFoundComponent: NotFoundRoute });

const callbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: CALLBACK_PATH,
  component: Callback,
});

/**
 * The frame, and its sign-in gate — every screen below it is inside both, and none can forget
 * either (plan 06, B-18). A layout without a path of its own: the addresses do not change.
 */
const frameRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_frame',
  component: FramedOutlet,
});

const indexRoute = createRoute({ getParentRoute: () => frameRoute, path: '/', component: App });

/**
 * The workbench, with the folder of the active tab in the **search**
 * ([06 · D-06](../../../docs/plans/06-workbench/decisions.md#d-06--a-url-do-workbench)).
 *
 * An address that names no folder is not an error: it is somebody who has not picked one yet, and
 * the welcome screen is where one is picked (plan 06, S-03).
 */
const workbenchRoute = createRoute({
  getParentRoute: () => frameRoute,
  path: '/workbench',
  // Always a string, empty when the link names no folder. Returned even then: the router keeps the
  // keys a validation leaves out, so a dropped `?folder=123` would come back as the number.
  validateSearch: (search: Readonly<Record<string, unknown>>) => ({
    folder: readWorkbenchSearch(search).folder ?? '',
  }),
  beforeLoad: ({ search }) => {
    if (search.folder === '') {
      throw redirect({ to: '/', replace: true });
    }
  },
  component: WorkbenchRoute,
});

/** What the user authorised in advance, in a route of its own so revoking is one click away. */
const rulesRoute = createRoute({
  getParentRoute: () => frameRoute,
  path: '/rules',
  component: RulesRoute,
});

/** One rule by id, in any state — where a trail entry leads to the rule that answered it. */
const ruleRoute = createRoute({
  getParentRoute: () => frameRoute,
  path: '/rules/$ruleId',
  component: RuleRoute,
});

/** The trail, with its filters in the search so a filtered trail is a link. */
const auditRoute = createRoute({
  getParentRoute: () => frameRoute,
  path: '/audit',
  validateSearch: readAuditSearch,
  component: AuditRoute,
});

/** The phones that may answer a permission request — a screen of its own, not a setting (B-29). */
const devicesRoute = createRoute({
  getParentRoute: () => frameRoute,
  path: '/devices',
  component: DevicesRoute,
});

/** Logs and diagnostics: the connection and the end-to-end round trip (B-30); plan 16 fills it. */
const diagnosticsRoute = createRoute({
  getParentRoute: () => frameRoute,
  path: '/diagnostics',
  component: DiagnosticsRoute,
});

/** `/settings` alone is the first section: the address always says which one is on screen. */
const settingsIndexRoute = createRoute({
  getParentRoute: () => frameRoute,
  path: '/settings',
  beforeLoad: () => {
    throw redirect({
      to: '/settings/$section',
      params: { section: firstSectionId(settingsSections.entries()) },
      replace: true,
    });
  },
});

/**
 * The app's Settings, one section at a time, the section in the path. A section nobody registered —
 * an old link, a plan not installed — lands on the first one, without an error (plan 06, S-142).
 */
const settingsRoute = createRoute({
  getParentRoute: () => frameRoute,
  path: '/settings/$section',
  beforeLoad: ({ params }) => {
    const entries = settingsSections.entries();
    const first = firstSectionId(entries);

    if (params.section !== first && !entries.some((entry) => entry.id === params.section)) {
      throw redirect({ to: '/settings/$section', params: { section: first }, replace: true });
    }
  },
  component: SettingsRoute,
});

/** The versions of the installation, the documentation and the license (B-32). */
const aboutRoute = createRoute({
  getParentRoute: () => frameRoute,
  path: '/about',
  component: AboutRoute,
});

/**
 * Every route, as one tree — exported so a test can mount the real table on a memory history.
 *
 * The map is in docs/architecture/web/04-state-and-data.md#o-mapa-de-rotas. `/claude…` and
 * `/usage…` are **reserved** to plans 11 and 14 and are deliberately absent: an address nobody
 * registered answers the translated not-found, never an empty screen. So do `/sessions/$sessionId`,
 * `/history` and `/history/$conversationId`, removed without a compatibility link
 * ([06 · D-07](../../../docs/plans/06-workbench/decisions.md#d-07--o-destino-da-home-e-das-rotas-antigas)):
 * the live session is in the tab of its folder, and the history comes back with plan 08.
 */
export const routeTree = rootRoute.addChildren([
  callbackRoute,
  frameRoute.addChildren([
    indexRoute,
    workbenchRoute,
    rulesRoute,
    ruleRoute,
    auditRoute,
    devicesRoute,
    diagnosticsRoute,
    settingsIndexRoute,
    settingsRoute,
    aboutRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
