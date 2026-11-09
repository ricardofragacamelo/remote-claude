import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RULES_SEARCH,
  readRulesSearch,
  ruleSummaryFilters,
  rulesListQuery,
} from '@/features/permission/lib/rules-search';

describe('reading the rules search from the URL', () => {
  it('defaults every field when the search is empty — S-156', () => {
    expect(readRulesSearch({})).toEqual(DEFAULT_RULES_SEARCH);
  });

  it('reads every well-formed field', () => {
    expect(
      readRulesSearch({
        tab: 'expired',
        decision: 'deny',
        scope: 'project',
        kind: 'shell',
        folder: '/srv/app',
        q: 'git',
        withAlert: true,
        sort: 'pattern',
        order: 'asc',
      }),
    ).toEqual({
      tab: 'expired',
      decision: 'deny',
      scope: 'project',
      kind: 'shell',
      folder: '/srv/app',
      q: 'git',
      withAlert: true,
      sort: 'pattern',
      order: 'asc',
    });
  });

  it('falls back to the default, field by field, for a value that is not well formed — S-156', () => {
    expect(
      readRulesSearch({ tab: 'nope', decision: 'maybe', sort: 'id', order: 'sideways' }),
    ).toEqual(DEFAULT_RULES_SEARCH);
  });

  it('drops a blank or whitespace-only string instead of keeping an empty filter', () => {
    expect(readRulesSearch({ kind: '  ', folder: '', q: '   ' })).toEqual(DEFAULT_RULES_SEARCH);
  });

  it('trims the free-text fields', () => {
    expect(readRulesSearch({ kind: ' shell ', q: ' git status ' })).toEqual({
      ...DEFAULT_RULES_SEARCH,
      kind: 'shell',
      q: 'git status',
    });
  });

  it('ignores `withAlert` unless it is exactly `true`', () => {
    expect(readRulesSearch({ withAlert: 'true' })).toEqual(DEFAULT_RULES_SEARCH);
    expect(readRulesSearch({ withAlert: false })).toEqual(DEFAULT_RULES_SEARCH);
  });
});

describe('the query the listing reads', () => {
  it('maps each tab to the status (or statuses) it reads — S-160', () => {
    expect(rulesListQuery({ ...DEFAULT_RULES_SEARCH, tab: 'active' }).status).toEqual(['active']);
    expect(rulesListQuery({ ...DEFAULT_RULES_SEARCH, tab: 'expiringSoon' }).status).toEqual([
      'active',
    ]);
    expect(rulesListQuery({ ...DEFAULT_RULES_SEARCH, tab: 'expired' }).status).toEqual(['expired']);
    expect(rulesListQuery({ ...DEFAULT_RULES_SEARCH, tab: 'revoked' }).status).toEqual(['revoked']);
    expect(rulesListQuery({ ...DEFAULT_RULES_SEARCH, tab: 'all' }).status).toEqual([
      'active',
      'expired',
      'revoked',
    ]);
  });

  it('carries the filters and the sort, never `withAlert`', () => {
    const query = rulesListQuery({
      tab: 'active',
      decision: 'allow',
      scope: 'always',
      kind: 'shell',
      folder: '/srv/app',
      q: 'git',
      withAlert: true,
      sort: 'pattern',
      order: 'asc',
    });

    expect(query).toEqual({
      decision: 'allow',
      scope: 'always',
      kind: 'shell',
      folder: '/srv/app',
      q: 'git',
      sort: 'pattern',
      order: 'asc',
      status: ['active'],
    });
    expect(query).not.toHaveProperty('withAlert');
  });

  it('leaves an absent filter absent, rather than `undefined`', () => {
    const query = rulesListQuery(DEFAULT_RULES_SEARCH);

    expect(query).not.toHaveProperty('decision');
    expect(query).not.toHaveProperty('scope');
    expect(query).not.toHaveProperty('kind');
    expect(query).not.toHaveProperty('folder');
    expect(query).not.toHaveProperty('q');
  });
});

describe('the filters the summary reads', () => {
  it('never carries a `status` — the summary counts over the listing’s own default predicate', () => {
    const filters = ruleSummaryFilters(
      { ...DEFAULT_RULES_SEARCH, tab: 'expired' },
      '2026-10-01T00:00:00.000Z',
    );

    expect(filters).not.toHaveProperty('status');
    expect(filters.expiresBefore).toBe('2026-10-01T00:00:00.000Z');
  });

  it('carries the same filters as the listing', () => {
    const filters = ruleSummaryFilters(
      {
        ...DEFAULT_RULES_SEARCH,
        decision: 'deny',
        scope: 'project',
        kind: 'shell',
        folder: '/srv/app',
        q: 'git',
      },
      '2026-10-01T00:00:00.000Z',
    );

    expect(filters).toEqual({
      decision: 'deny',
      scope: 'project',
      kind: 'shell',
      folder: '/srv/app',
      q: 'git',
      expiresBefore: '2026-10-01T00:00:00.000Z',
    });
  });
});
