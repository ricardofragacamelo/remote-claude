import { describe, expect, it } from 'vitest';

import {
  hasAcceptedBroadItem,
  isTemplateItemBlocked,
  templateAcceptIndices,
  templateBatchStateOf,
  templateBroadIndices,
  templateExportFileOf,
} from '@/features/permission/lib/template-import';
import type {
  TemplatePreviewItem,
  TemplateRuleRow,
} from '@/features/permission/lib/template-import';

function item(partial: Partial<TemplatePreviewItem> & { index: number }): TemplatePreviewItem {
  return {
    pattern: 'shell(git status:*)',
    decision: 'allow',
    scope: 'always',
    verdict: 'new',
    ...partial,
  };
}

describe('templateExportFileOf — the file the import preview/apply routes both read (plan 15, B-30, D-16)', () => {
  const rules: readonly TemplateRuleRow[] = [
    { pattern: 'shell(pnpm test:*)', decision: 'allow', breadth: 'narrow' },
    { pattern: 'shell(npm test:*)', decision: 'allow', breadth: 'narrow' },
  ];

  it('writes the format envelope and every rule, scoped `always` with no folder', () => {
    const parsed = JSON.parse(templateExportFileOf({ rules, scope: 'always', folder: null })) as {
      format: string;
      version: number;
      rules: readonly {
        pattern: string;
        decision: string;
        scope: string;
        projectPath: string | null;
      }[];
    };

    expect(parsed.format).toBe('remote-claude.permission-rules');
    expect(parsed.version).toBe(1);
    expect(parsed.rules).toEqual([
      {
        pattern: 'shell(pnpm test:*)',
        decision: 'allow',
        scope: 'always',
        projectPath: null,
        expiresAt: expect.any(String),
      },
      {
        pattern: 'shell(npm test:*)',
        decision: 'allow',
        scope: 'always',
        projectPath: null,
        expiresAt: expect.any(String),
      },
    ]);
  });

  it('carries the chosen folder as projectPath, scoped `project`', () => {
    const parsed = JSON.parse(
      templateExportFileOf({ rules, scope: 'project', folder: '/srv/app' }),
    ) as { rules: readonly { projectPath: string | null }[] };

    expect(parsed.rules.every((rule) => rule.projectPath === '/srv/app')).toBe(true);
  });

  it('writes nothing for an empty bundle', () => {
    const parsed = JSON.parse(
      templateExportFileOf({ rules: [], scope: 'always', folder: null }),
    ) as { rules: readonly unknown[] };

    expect(parsed.rules).toEqual([]);
  });
});

describe('isTemplateItemBlocked — unbounded refused for allow, same D-09 (plan 15, B-30)', () => {
  it('blocks an unbounded allow', () => {
    expect(isTemplateItemBlocked({ decision: 'allow', breadth: 'unbounded' })).toBe(true);
  });

  it('never blocks an unbounded deny', () => {
    expect(isTemplateItemBlocked({ decision: 'deny', breadth: 'unbounded' })).toBe(false);
  });

  it('never blocks a narrow or broad allow', () => {
    expect(isTemplateItemBlocked({ decision: 'allow', breadth: 'narrow' })).toBe(false);
    expect(isTemplateItemBlocked({ decision: 'allow', breadth: 'broad' })).toBe(false);
  });

  it('never blocks an item with no breadth at all (an `invalid` verdict)', () => {
    expect(isTemplateItemBlocked({ decision: 'allow' })).toBe(false);
  });
});

describe('templateAcceptIndices — the indices `accept` carries (plan 15, B-30, S-203)', () => {
  it('accepts every included, new or existing, unblocked item', () => {
    const items = [item({ index: 0, verdict: 'new' }), item({ index: 1, verdict: 'existing' })];
    expect(templateAcceptIndices(items, new Set([0, 1]))).toEqual([0, 1]);
  });

  it('excludes an item not in `included`', () => {
    const items = [item({ index: 0 }), item({ index: 1 })];
    expect(templateAcceptIndices(items, new Set([0]))).toEqual([0]);
  });

  it('excludes an `invalid` item even if included', () => {
    const items = [item({ index: 0, verdict: 'invalid', code: 'INVALID_INPUT' })];
    expect(templateAcceptIndices(items, new Set([0]))).toEqual([]);
  });

  it('excludes a blocked (unbounded allow) item even if included', () => {
    const items = [item({ index: 0, decision: 'allow', breadth: 'unbounded' })];
    expect(templateAcceptIndices(items, new Set([0]))).toEqual([]);
  });

  it('is empty for an empty item list', () => {
    expect(templateAcceptIndices([], new Set([0]))).toEqual([]);
  });
});

describe('templateBroadIndices — the indices `acknowledgeBroad` carries (plan 15, B-30, D-09)', () => {
  it('is empty when the acknowledgement is not checked, whatever the items are', () => {
    const items = [item({ index: 0, breadth: 'broad' })];
    expect(templateBroadIndices(items, [0], false)).toEqual([]);
  });

  it('carries every accepted broad item, once acknowledged', () => {
    const items = [
      item({ index: 0, breadth: 'broad' }),
      item({ index: 1, breadth: 'narrow' }),
      item({ index: 2, breadth: 'broad' }),
    ];
    expect(templateBroadIndices(items, [0, 1, 2], true)).toEqual([0, 2]);
  });

  it('never carries a broad item that was not itself accepted', () => {
    const items = [item({ index: 0, breadth: 'broad' })];
    expect(templateBroadIndices(items, [], true)).toEqual([]);
  });
});

describe('hasAcceptedBroadItem — whether the acknowledgement checkbox needs to exist at all', () => {
  it('is true when an accepted item is broad', () => {
    const items = [item({ index: 0, breadth: 'broad' })];
    expect(hasAcceptedBroadItem(items, [0])).toBe(true);
  });

  it('is false when no accepted item is broad', () => {
    const items = [item({ index: 0, breadth: 'narrow' })];
    expect(hasAcceptedBroadItem(items, [0])).toBe(false);
  });

  it('is false when the only broad item was not accepted', () => {
    const items = [item({ index: 0, breadth: 'broad' })];
    expect(hasAcceptedBroadItem(items, [])).toBe(false);
  });

  it('is false for an empty accepted list', () => {
    expect(hasAcceptedBroadItem([item({ index: 0, breadth: 'broad' })], [])).toBe(false);
  });
});

describe('templateBatchStateOf — every derived bit TemplateReview reads, in one place (plan 15, B-30)', () => {
  const rules: readonly TemplateRuleRow[] = [
    { pattern: 'shell(pnpm test:*)', decision: 'allow', breadth: 'narrow' },
    { pattern: 'shell(npm test:*)', decision: 'allow', breadth: 'narrow' },
  ];

  it('cannot confirm before the preview has answered', () => {
    const state = templateBatchStateOf({
      rules,
      excluded: new Set(),
      preview: null,
      acknowledgeBroad: false,
      scopeReady: true,
      expiresAt: '2027-01-01T00:00:00.000Z',
      submitting: false,
    });

    expect(state.included).toEqual(new Set([0, 1]));
    expect(state.accepted).toEqual([]);
    expect(state.needsAcknowledge).toBe(false);
    expect(state.canConfirm).toBe(false);
  });

  it('can confirm once scope, validity and preview are all ready, with something accepted', () => {
    const preview = [item({ index: 0 }), item({ index: 1 })];
    const state = templateBatchStateOf({
      rules,
      excluded: new Set(),
      preview,
      acknowledgeBroad: false,
      scopeReady: true,
      expiresAt: '2027-01-01T00:00:00.000Z',
      submitting: false,
    });

    expect(state.accepted).toEqual([0, 1]);
    expect(state.canConfirm).toBe(true);
  });

  it('excludes a toggled-off rule from `included` and so from `accepted`', () => {
    const preview = [item({ index: 0 }), item({ index: 1 })];
    const state = templateBatchStateOf({
      rules,
      excluded: new Set([1]),
      preview,
      acknowledgeBroad: false,
      scopeReady: true,
      expiresAt: '2027-01-01T00:00:00.000Z',
      submitting: false,
    });

    expect(state.included).toEqual(new Set([0]));
    expect(state.accepted).toEqual([0]);
  });

  it('cannot confirm while the scope/folder is not ready', () => {
    const state = templateBatchStateOf({
      rules,
      excluded: new Set(),
      preview: [item({ index: 0 }), item({ index: 1 })],
      acknowledgeBroad: false,
      scopeReady: false,
      expiresAt: '2027-01-01T00:00:00.000Z',
      submitting: false,
    });

    expect(state.canConfirm).toBe(false);
  });

  it('cannot confirm before a validity is picked', () => {
    const state = templateBatchStateOf({
      rules,
      excluded: new Set(),
      preview: [item({ index: 0 }), item({ index: 1 })],
      acknowledgeBroad: false,
      scopeReady: true,
      expiresAt: null,
      submitting: false,
    });

    expect(state.canConfirm).toBe(false);
  });

  it('cannot confirm while already submitting', () => {
    const state = templateBatchStateOf({
      rules,
      excluded: new Set(),
      preview: [item({ index: 0 }), item({ index: 1 })],
      acknowledgeBroad: false,
      scopeReady: true,
      expiresAt: '2027-01-01T00:00:00.000Z',
      submitting: true,
    });

    expect(state.canConfirm).toBe(false);
  });

  it('cannot confirm when nothing would actually be accepted', () => {
    const state = templateBatchStateOf({
      rules,
      excluded: new Set([0, 1]),
      preview: [item({ index: 0 }), item({ index: 1 })],
      acknowledgeBroad: false,
      scopeReady: true,
      expiresAt: '2027-01-01T00:00:00.000Z',
      submitting: false,
    });

    expect(state.accepted).toEqual([]);
    expect(state.canConfirm).toBe(false);
  });

  it('needs the acknowledgement for an accepted broad item, and cannot confirm without it', () => {
    const preview = [item({ index: 0, breadth: 'broad' }), item({ index: 1 })];
    const state = templateBatchStateOf({
      rules,
      excluded: new Set(),
      preview,
      acknowledgeBroad: false,
      scopeReady: true,
      expiresAt: '2027-01-01T00:00:00.000Z',
      submitting: false,
    });

    expect(state.needsAcknowledge).toBe(true);
    expect(state.canConfirm).toBe(false);
  });

  it('confirms once the broad item is acknowledged', () => {
    const preview = [item({ index: 0, breadth: 'broad' }), item({ index: 1 })];
    const state = templateBatchStateOf({
      rules,
      excluded: new Set(),
      preview,
      acknowledgeBroad: true,
      scopeReady: true,
      expiresAt: '2027-01-01T00:00:00.000Z',
      submitting: false,
    });

    expect(state.needsAcknowledge).toBe(false);
    expect(state.canConfirm).toBe(true);
  });

  it('reads validityDecision as `allow` when any rule in the bundle is `allow`', () => {
    const state = templateBatchStateOf({
      rules: [
        { pattern: 'web.fetch', decision: 'deny', breadth: 'broad' },
        { pattern: 'shell(pnpm test:*)', decision: 'allow', breadth: 'narrow' },
      ],
      excluded: new Set(),
      preview: null,
      acknowledgeBroad: false,
      scopeReady: false,
      expiresAt: null,
      submitting: false,
    });

    expect(state.validityDecision).toBe('allow');
  });

  it('reads validityDecision as `deny` when every rule in the bundle is `deny`', () => {
    const state = templateBatchStateOf({
      rules: [{ pattern: 'web.fetch', decision: 'deny', breadth: 'broad' }],
      excluded: new Set(),
      preview: null,
      acknowledgeBroad: false,
      scopeReady: false,
      expiresAt: null,
      submitting: false,
    });

    expect(state.validityDecision).toBe('deny');
  });

  it('reads an empty bundle as `included` empty, `accepted` empty — nothing to confirm', () => {
    const state = templateBatchStateOf({
      rules: [],
      excluded: new Set(),
      preview: [],
      acknowledgeBroad: false,
      scopeReady: true,
      expiresAt: '2027-01-01T00:00:00.000Z',
      submitting: false,
    });

    expect(state.included).toEqual(new Set());
    expect(state.accepted).toEqual([]);
    expect(state.canConfirm).toBe(false);
  });
});
