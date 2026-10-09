import { describe, expect, it } from 'vitest';
import {
  createMemoryHistory,
  createRouter,
  defaultParseSearch,
  defaultStringifySearch,
} from '@tanstack/react-router';

import { readAuditSearch } from '@/app/AuditRoute';
import { routeTree, router } from '@/app/router';
import { readWorkbenchSearch, workbenchLocation } from '@/app/workbench-location';
import { CALLBACK_PATH } from '@/features/auth';

describe('the routes', () => {
  it('serves the screen at the root', () => {
    expect(Object.keys(router.routesByPath)).toContain('/');
  });

  it('serves the provider’s callback, at the path the login publishes', () => {
    expect(Object.keys(router.routesByPath)).toContain(CALLBACK_PATH);
  });

  it('gives the rules a route of their own, so revoking is one click away — D-04', () => {
    expect(Object.keys(router.routesByPath)).toContain('/rules');
  });

  it('gives one rule a route of its own, so a trail entry can open it — D-18', () => {
    expect(Object.keys(router.routesByPath)).toContain('/rules/$ruleId');
  });

  it('gives the trail a route of its own — B-13', () => {
    expect(Object.keys(router.routesByPath)).toContain('/audit');
  });

  it('gives each subject a screen of its own — plan 06, B-29…B-32', () => {
    expect(Object.keys(router.routesByPath)).toEqual(
      expect.arrayContaining([
        '/devices',
        '/diagnostics',
        '/settings',
        '/settings/$section',
        '/about',
      ]),
    );
  });

  it('has no route for a session nor for the history any more — D-07, S-150', () => {
    const removed = Object.keys(router.routesByPath).filter(
      (path) => path.startsWith('/sessions') || path.startsWith('/history'),
    );

    expect(removed).toEqual([]);
  });
});

describe('the filters of the trail, read from the URL', () => {
  it('keeps every well-formed filter', () => {
    expect(
      readAuditSearch({
        sessionId: 'S1',
        toolName: 'Bash',
        decision: 'allowed',
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-02T00:00:00.000Z',
      }),
    ).toEqual({
      sessionId: 'S1',
      toolName: 'Bash',
      decision: 'allowed',
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-02T00:00:00.000Z',
    });
  });

  it('drops what a hand-edited link says wrongly, rather than sending it', () => {
    expect(
      readAuditSearch({ sessionId: '  ', decision: 'maybe', toolName: 42, extra: 'x' }),
    ).toEqual({});
  });

  it('trims what it keeps', () => {
    expect(readAuditSearch({ toolName: ' Bash ' })).toEqual({ toolName: 'Bash' });
  });
});

/** The real table of routes, landed on `href` — what pasting the link in the browser does. */
async function land(href: string) {
  const landed = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [href] }),
  });
  await landed.load();

  return {
    routes: landed.state.matches.map((match) => match.routeId),
    params: landed.state.matches.at(-1)?.params,
    search: landed.state.location.search,
  };
}

describe('the routes that stay, reached by their links — plan 06, S-06', () => {
  it('lands the filtered trail with every filter it was given', async () => {
    const landed = await land('/audit?decision=allowed&toolName=Bash&sessionId=S1');

    expect(landed.routes).toEqual(['__root__', '/_frame', '/_frame/audit']);
    expect(landed.search).toEqual({ decision: 'allowed', toolName: 'Bash', sessionId: 'S1' });
  });

  it('lands the rules, and one rule by its id', async () => {
    expect((await land('/rules')).routes).toEqual(['__root__', '/_frame', '/_frame/rules']);

    const rule = await land('/rules/01J0RULE');

    expect(rule.routes).toEqual(['__root__', '/_frame', '/_frame/rules/$ruleId']);
    expect(rule.params).toEqual({ ruleId: '01J0RULE' });
  });

  it('lands the sign-in callback with what the provider sent back', async () => {
    const landed = await land(`${CALLBACK_PATH}?code=c1&state=s1`);

    expect(landed.routes).toEqual(['__root__', CALLBACK_PATH]);
    expect(landed.search).toEqual({ code: 'c1', state: 's1' });
  });
});

describe('the addresses plan 06 removed — D-07, S-150', () => {
  it.each([
    '/sessions/01J0ABCDEFGHJKMNPQRSTVWXYZ',
    '/history',
    '/history?workspacePath=%2Fsrv',
    '/history/c1',
  ])('answers %s with the root alone, which renders the translated not-found', async (href) => {
    expect((await land(href)).routes).toEqual(['__root__']);
  });
});

describe('the settings, one section at a time — plan 06, S-142', () => {
  it('lands the section the link names', async () => {
    const landed = await land('/settings/workspaces');

    expect(landed.routes).toEqual(['__root__', '/_frame', '/_frame/settings/$section']);
    expect(landed.params).toEqual({ section: 'workspaces' });
  });

  it('keeps /settings/editor, the section the editor registers at load — plan 07, B-39', async () => {
    const landed = await land('/settings/editor');

    expect(landed.params).toEqual({ section: 'editor' });
  });

  // `/settings/terminal` is plan 12's, not installed yet; `/settings/editor` is plan 07's, and is.
  it.each(['/settings', '/settings/terminal', '/settings/claude'])(
    'sends %s, which names no section here, to the first one — without an error',
    async (href) => {
      const landed = await land(href);

      expect(landed.routes).toEqual(['__root__', '/_frame', '/_frame/settings/$section']);
      expect(landed.params).toEqual({ section: 'appearance' });
    },
  );
});

describe('the other screens of the navigation, reached by their links', () => {
  it.each([
    ['/claude-settings', '/_frame/claude-settings'],
    ['/devices', '/_frame/devices'],
    ['/diagnostics', '/_frame/diagnostics'],
    ['/about', '/_frame/about'],
  ])('lands %s inside the frame', async (href, id) => {
    expect((await land(href)).routes).toEqual(['__root__', '/_frame', id]);
  });
});

describe('the addresses no plan has registered yet — plan 06, S-07', () => {
  it.each(['/claude', '/claude/settings', '/usage', '/usage/2026-09', '/no/such/screen'])(
    'answers %s with the root alone, which renders the not-found',
    async (href) => {
      expect((await land(href)).routes).toEqual(['__root__']);
    },
  );

  it('reserves /usage — and anything under /claude/ — by leaving them out of the table', () => {
    const reserved = Object.keys(router.routesById).filter(
      (id) => id.startsWith('/claude/') || id.startsWith('/usage') || id.includes('/claude/'),
    );

    expect(reserved).toEqual([]);
  });
});

describe('the workbench, reached by its link — plan 06, B-16', () => {
  it('lands the workbench with the folder the link names', async () => {
    const landed = await land(workbenchLocation({ folder: '/srv/projects/a b#1' }));

    expect(landed.routes).toEqual(['__root__', '/_frame', '/_frame/workbench']);
    expect(landed.search).toEqual({ folder: '/srv/projects/a b#1' });
  });

  it.each(['/workbench', '/workbench?folder=', '/workbench?folder=123'])(
    'sends %s, which names no folder, to the welcome screen rather than to an error — S-03',
    async (href) => {
      const landed = await land(href);

      expect(landed.routes).toEqual(['__root__', '/_frame', '/_frame/']);
    },
  );
});

describe('the folder of the workbench, read from the URL — plan 06, S-04', () => {
  const awkward = [
    '/home/u/my projects/remote-claude',
    '/home/u/ação/documentos',
    '/srv/#1',
    '/srv/100%',
    '/srv/what?',
    '/srv/a&b=c',
    '/srv/ends with a space ',
    '/srv/+plus+',
  ];

  it.each(awkward)('takes %j through the router and back without losing a character', (folder) => {
    expect(readWorkbenchSearch(defaultParseSearch(defaultStringifySearch({ folder })))).toEqual({
      folder,
    });
  });

  it.each(awkward)('writes %j into its own address the way the router reads it back', (folder) => {
    const address = workbenchLocation({ folder });

    expect(address.startsWith('/workbench?folder=')).toBe(true);
    expect(readWorkbenchSearch(defaultParseSearch(address.slice('/workbench'.length)))).toEqual({
      folder,
    });
  });

  it('is the workbench alone when no folder is named', () => {
    expect(workbenchLocation({})).toBe('/workbench');
  });

  it.each([
    ['absent', {}],
    ['empty', { folder: '' }],
    ['a number the router parsed', defaultParseSearch('?folder=123')],
    ['a list', { folder: ['/srv/a'] }],
  ])('names no folder when it is %s', (_case, search) => {
    expect(readWorkbenchSearch(search)).toEqual({});
  });
});

describe('the active file of the workbench, in the URL — plan 07, S-10, S-216', () => {
  it.each(['src/main.ts', 'a b/ç#1%.ts', '../climbs/out'])(
    'takes %j through its own address and back, exactly — the server decides what it may name',
    (file) => {
      const address = workbenchLocation({ folder: '/srv/app', file });

      expect(readWorkbenchSearch(defaultParseSearch(address.slice('/workbench'.length)))).toEqual({
        folder: '/srv/app',
        file,
      });
    },
  );

  it('names no file that is empty or not text, and none without a folder', () => {
    expect(readWorkbenchSearch({ folder: '/srv/app', file: '' })).toEqual({ folder: '/srv/app' });
    expect(readWorkbenchSearch(defaultParseSearch('?folder=%2Fsrv&file=123'))).toEqual({
      folder: '/srv',
    });
    expect(readWorkbenchSearch({ file: 'a.ts' })).toEqual({});
  });

  it('keeps the file a link names on the route of the workbench', async () => {
    const landed = await land(workbenchLocation({ folder: '/srv/projects/app', file: 'src/a.ts' }));

    expect(landed.search).toMatchObject({ folder: '/srv/projects/app', file: 'src/a.ts' });
  });
});

describe('what the panel of Claude shows, in the URL — plan 08, D-24', () => {
  it('takes a session through its own address and back', () => {
    const address = workbenchLocation({ folder: '/srv/app', file: 'a.ts', session: 'S1' });

    expect(readWorkbenchSearch(defaultParseSearch(address.slice('/workbench'.length)))).toEqual({
      folder: '/srv/app',
      file: 'a.ts',
      session: 'S1',
    });
  });

  it('takes a conversation through its own address and back', () => {
    const address = workbenchLocation({ folder: '/srv/app', conversation: 'C1' });

    expect(readWorkbenchSearch(defaultParseSearch(address.slice('/workbench'.length)))).toEqual({
      folder: '/srv/app',
      conversation: 'C1',
    });
  });

  it('keeps the session when a link names both: the panel shows one thing', () => {
    expect(readWorkbenchSearch({ folder: '/srv/app', session: 'S1', conversation: 'C1' })).toEqual({
      folder: '/srv/app',
      session: 'S1',
    });
  });

  it('names neither without a folder, nor one that is empty', () => {
    expect(readWorkbenchSearch({ session: 'S1' })).toEqual({});
    expect(readWorkbenchSearch({ folder: '/srv/app', session: '', conversation: '' })).toEqual({
      folder: '/srv/app',
    });
  });
});
