import { describe, expect, it } from 'vitest';
import {
  createMemoryHistory,
  createRouter,
  defaultParseSearch,
  defaultStringifySearch,
} from '@tanstack/react-router';

import { auditLocation, readAuditSearch } from '@/app/AuditRoute';
import { historyLocation, readHistorySearch } from '@/app/HistoryRoute';
import { routeTree, router } from '@/app/router';
import { readWorkbenchSearch, workbenchLocation } from '@/app/workbench-location';
import { CALLBACK_PATH } from '@/features/auth';

describe('the routes', () => {
  it('serves the screen at the root', () => {
    expect(Object.keys(router.routesById)).toContain('/');
  });

  it('serves the provider’s callback, at the path the login publishes', () => {
    expect(Object.keys(router.routesById)).toContain(CALLBACK_PATH);
  });

  it('carries the session in the path, so the link reproduces the screen', () => {
    // The test the architecture states: pasting the link on another device brings up the same
    // screen. A session held in a store would fail it.
    expect(Object.keys(router.routesById)).toContain('/sessions/$sessionId');
  });

  it('gives the rules a route of their own, so revoking is one click away — D-04', () => {
    expect(Object.keys(router.routesById)).toContain('/rules');
  });

  it('gives one rule a route of its own, so a trail entry can open it — D-18', () => {
    expect(Object.keys(router.routesById)).toContain('/rules/$ruleId');
  });

  it('gives the trail a route of its own — B-13', () => {
    expect(Object.keys(router.routesById)).toContain('/audit');
  });

  it('gives the history two levels of its own — plan 04, D-03', () => {
    expect(Object.keys(router.routesById)).toEqual(
      expect.arrayContaining(['/history', '/history/$conversationId']),
    );
  });
});

describe('the workspace of the history, read from the URL — plan 04', () => {
  it('keeps a workspace the link names, trimmed', () => {
    expect(readHistorySearch({ workspacePath: ' /srv/projects/app ' })).toEqual({
      workspacePath: '/srv/projects/app',
    });
  });

  it.each([
    ['absent', {}],
    ['empty', { workspacePath: '  ' }],
    ['not text', { workspacePath: 3 }],
  ])('drops one that is %s', (_case, search) => {
    expect(readHistorySearch(search)).toEqual({});
  });

  it('writes its own address back, workspace included', () => {
    expect(historyLocation({})).toBe('/history');
    expect(historyLocation({ workspacePath: '/srv/projects/app' })).toBe(
      '/history?workspacePath=%2Fsrv%2Fprojects%2Fapp',
    );
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

describe('the address a sign-in comes back to, from the trail', () => {
  it('is the trail alone when nothing is filtered', () => {
    expect(auditLocation({})).toBe('/audit');
  });

  it('carries every filter, so a filtered link survives the sign-in — S-43', () => {
    expect(auditLocation({ sessionId: 'S1', decision: 'allowed', toolName: 'Write' })).toBe(
      '/audit?sessionId=S1&decision=allowed&toolName=Write',
    );
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

    expect(landed.routes).toEqual(['__root__', '/audit']);
    expect(landed.search).toEqual({ decision: 'allowed', toolName: 'Bash', sessionId: 'S1' });
  });

  it('lands the rules, and one rule by its id', async () => {
    expect((await land('/rules')).routes).toEqual(['__root__', '/rules']);

    const rule = await land('/rules/01J0RULE');

    expect(rule.routes).toEqual(['__root__', '/rules/$ruleId']);
    expect(rule.params).toEqual({ ruleId: '01J0RULE' });
  });

  it('lands the sign-in callback with what the provider sent back', async () => {
    const landed = await land(`${CALLBACK_PATH}?code=c1&state=s1`);

    expect(landed.routes).toEqual(['__root__', CALLBACK_PATH]);
    expect(landed.search).toEqual({ code: 'c1', state: 's1' });
  });
});

describe('the addresses no plan has registered yet — plan 06, S-07', () => {
  it.each(['/claude', '/claude/settings', '/usage', '/usage/2026-09', '/no/such/screen'])(
    'answers %s with the root alone, which renders the not-found',
    async (href) => {
      expect((await land(href)).routes).toEqual(['__root__']);
    },
  );

  it('reserves /claude and /usage by leaving them out of the table, not by an empty route', () => {
    const reserved = Object.keys(router.routesById).filter(
      (id) => id.startsWith('/claude') || id.startsWith('/usage'),
    );

    expect(reserved).toEqual([]);
  });
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
