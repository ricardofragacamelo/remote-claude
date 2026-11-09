import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyRuleImport,
  changeRuleExpiry,
  evaluateRule,
  fetchRule,
  fetchRuleExport,
  fetchRuleHistory,
  fetchRuleInvocations,
  fetchRuleSummary,
  fetchRuleTemplates,
  fetchRules,
  grantRule,
  previewRule,
  previewRuleImport,
  restoreRules,
  revokeRule,
  revokeRules,
  simulateRules,
} from '@/features/permission/services/rule.service';
import { api } from '@/shared/api/api';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchRules', () => {
  it('asks the listing with no query when no filter or sort is given', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ rules: [] });

    await fetchRules({}, null);

    expect(get).toHaveBeenCalledWith('/permission-rules');
  });

  it('carries every filter and the sort, in the query — plan 15, B-20', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ rules: [] });

    await fetchRules(
      {
        status: ['active', 'expired'],
        scope: 'project',
        decision: 'deny',
        engine: 'claude',
        kind: 'shell',
        folder: '/srv/app',
        q: 'git',
        expiresBefore: '2026-12-01T00:00:00.000Z',
        sort: 'expiresAt',
        order: 'asc',
      },
      null,
    );

    const [path] = get.mock.calls[0] as [string];
    const query = new URLSearchParams(path.split('?')[1]);

    expect(query.get('status')).toBe('active,expired');
    expect(query.get('scope')).toBe('project');
    expect(query.get('decision')).toBe('deny');
    expect(query.get('engine')).toBe('claude');
    expect(query.get('kind')).toBe('shell');
    expect(query.get('folder')).toBe('/srv/app');
    expect(query.get('q')).toBe('git');
    expect(query.get('expiresBefore')).toBe('2026-12-01T00:00:00.000Z');
    expect(query.get('sort')).toBe('expiresAt');
    expect(query.get('order')).toBe('asc');
  });

  it('carries the cursor, opaque, as the previous page gave it', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ rules: [] });

    await fetchRules({}, 'opaque-cursor');

    expect(get).toHaveBeenCalledWith('/permission-rules?cursor=opaque-cursor');
  });

  it('answers the page, defaulting a missing `nextCursor` to null', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ rules: [] });

    expect(await fetchRules({}, null)).toEqual({ rules: [], nextCursor: null });
  });

  it('lets the failure through, already translated into an app error by the client', async () => {
    const failure = { code: 'INTERNAL_ERROR', messageKey: 'common.error.unexpected', traceId: 't' };
    vi.spyOn(api, 'get').mockRejectedValue(failure);

    await expect(fetchRules({}, null)).rejects.toBe(failure);
  });
});

describe('fetchRuleSummary', () => {
  it('reads the same filters the listing takes, and nothing of its sort or page', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({});

    await fetchRuleSummary({ scope: 'always', decision: 'allow' });

    expect(get).toHaveBeenCalledWith('/permission-rules/summary?scope=always&decision=allow');
  });

  it('asks the summary with no query when there is no filter', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({});

    await fetchRuleSummary({});

    expect(get).toHaveBeenCalledWith('/permission-rules/summary');
  });
});

describe('fetchRule', () => {
  it('opens one rule by id, whatever its state', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ id: 'rule_1' });

    await fetchRule('rule_1');

    expect(get).toHaveBeenCalledWith('/permission-rules/rule_1');
  });

  it('escapes the id, so it cannot build a path of its own', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({});

    await fetchRule('rule/../other');

    expect(get).toHaveBeenCalledWith('/permission-rules/rule%2F..%2Fother');
  });
});

describe('fetchRuleInvocations', () => {
  it('asks with no cursor for the first page, and with one for the next', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ invocations: [], nextCursor: null });

    await fetchRuleInvocations('rule_1', null);
    expect(get).toHaveBeenLastCalledWith('/permission-rules/rule_1/invocations');

    await fetchRuleInvocations('rule_1', 7);
    expect(get).toHaveBeenLastCalledWith('/permission-rules/rule_1/invocations?cursor=7');
  });
});

describe('fetchRuleHistory', () => {
  it('reads the events of one rule', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ events: [] });

    await fetchRuleHistory('rule_1');

    expect(get).toHaveBeenCalledWith('/permission-rules/rule_1/history');
  });
});

describe('grantRule', () => {
  it('posts exactly what it was given', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ id: 'rule_1' });
    const input = {
      pattern: 'shell(git status:*)',
      decision: 'allow' as const,
      scope: 'always' as const,
    };

    await grantRule(input);

    expect(post).toHaveBeenCalledWith('/permission-rules', input);
  });
});

describe('revokeRule', () => {
  it('deletes the rule, and answers it as it now stands', async () => {
    const del = vi.spyOn(api, 'delete').mockResolvedValue({ id: 'rule_1', revokedAt: 'now' });

    const revoked = await revokeRule('rule_1');

    expect(del).toHaveBeenCalledWith('/permission-rules/rule_1');
    expect(revoked).toEqual({ id: 'rule_1', revokedAt: 'now' });
  });

  it('escapes an id, so nothing a backend answered can build a path of its own', async () => {
    const del = vi.spyOn(api, 'delete').mockResolvedValue({});

    await revokeRule('rule/../other');

    expect(del).toHaveBeenCalledWith('/permission-rules/rule%2F..%2Fother');
  });
});

describe('changeRuleExpiry', () => {
  it('sends `If-Match` with the rule’s own etag — plan 15, B-12', async () => {
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ id: 'rule_1' });

    await changeRuleExpiry({
      ruleId: 'rule_1',
      etag: '"abc"',
      expiresAt: '2026-12-01T00:00:00.000Z',
    });

    expect(patch).toHaveBeenCalledWith(
      '/permission-rules/rule_1',
      { expiresAt: '2026-12-01T00:00:00.000Z' },
      { headers: { 'if-match': '"abc"' } },
    );
  });
});

describe('revokeRules and restoreRules', () => {
  it('posts the ids of the lot, in the order given', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ rules: [] });

    await revokeRules(['a', 'b']);
    expect(post).toHaveBeenLastCalledWith('/permission-rules/revoke', { ids: ['a', 'b'] });

    await restoreRules(['a', 'b']);
    expect(post).toHaveBeenLastCalledWith('/permission-rules/restore', { ids: ['a', 'b'] });
  });
});

describe('evaluateRule, previewRule and simulateRules', () => {
  it('post exactly what each was given, to its own route — plan 15, B-14, B-15, B-16', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({});

    await evaluateRule({ kind: 'shell', subject: { command: 'git status' } });
    expect(post).toHaveBeenLastCalledWith('/permission-rules/evaluate', {
      kind: 'shell',
      subject: { command: 'git status' },
    });

    await previewRule({ pattern: 'shell(ls)', decision: 'allow', scope: 'always' });
    expect(post).toHaveBeenLastCalledWith('/permission-rules/preview', {
      pattern: 'shell(ls)',
      decision: 'allow',
      scope: 'always',
    });

    await simulateRules({ remove: ['rule_1'] });
    expect(post).toHaveBeenLastCalledWith('/permission-rules/simulate', { remove: ['rule_1'] });
  });
});

describe('fetchRuleTemplates', () => {
  it('reads the catalog', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ templates: [] });

    await fetchRuleTemplates();

    expect(get).toHaveBeenCalledWith('/permission-rules/templates');
  });
});

describe('fetchRuleExport', () => {
  it('reads the same filters the listing takes', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ rules: [] });

    await fetchRuleExport({ decision: 'deny' });

    expect(get).toHaveBeenCalledWith('/permission-rules/export?decision=deny');
  });
});

describe('previewRuleImport and applyRuleImport', () => {
  it('preview posts the file; apply posts the file, digest and what was accepted', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({});

    await previewRuleImport('{"format":"remote-claude.permission-rules"}');
    expect(post).toHaveBeenLastCalledWith('/permission-rules/import/preview', {
      file: '{"format":"remote-claude.permission-rules"}',
    });

    const input = { file: 'the-file', digest: 'abc', accept: [0, 1] };
    await applyRuleImport(input);
    expect(post).toHaveBeenLastCalledWith('/permission-rules/import', input);
  });
});
