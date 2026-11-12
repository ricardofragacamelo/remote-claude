import { describe, expect, it } from 'vitest';

import {
  importBatchStateOf,
  importedPathsOf,
  importRowsOf,
  isReachableFolder,
} from '@/features/permission/lib/file-import';
import type { ImportPreviewItem, ImportRow } from '@/features/permission/lib/file-import';

function item(partial: Partial<ImportPreviewItem> & { index: number }): ImportPreviewItem {
  return {
    pattern: 'shell(git status:*)',
    decision: 'allow',
    scope: 'always',
    verdict: 'new',
    ...partial,
  };
}

function row(partial: Partial<ImportRow> & { item: ImportPreviewItem }): ImportRow {
  return {
    projectPath: null,
    needsRemap: false,
    blocked: false,
    ...partial,
  };
}

describe('importedPathsOf — the file’s own projectPath, read back alongside the preview (plan 15, B-31, D-17)', () => {
  it('reads one path per rule, in order, null for a rule with none', () => {
    const file = JSON.stringify({
      rules: [{ projectPath: '/srv/app' }, { projectPath: null }, {}],
    });

    expect(importedPathsOf(file)).toEqual(['/srv/app', null, null]);
  });

  it('is null for a file that is not JSON at all', () => {
    expect(importedPathsOf('not json')).toBeNull();
  });

  it('is null for JSON with no `rules` array', () => {
    expect(importedPathsOf(JSON.stringify({}))).toBeNull();
    expect(importedPathsOf(JSON.stringify({ rules: 'nope' }))).toBeNull();
    expect(importedPathsOf(JSON.stringify(null))).toBeNull();
  });

  it('is null for an array rather than an object at the top level', () => {
    expect(importedPathsOf(JSON.stringify([1, 2]))).toBeNull();
  });

  it('reads a non-string projectPath as null, never throwing', () => {
    const file = JSON.stringify({ rules: [{ projectPath: 42 }, 'not an object', null] });

    expect(importedPathsOf(file)).toEqual([null, null, null]);
  });

  it('is an empty list for an empty `rules`', () => {
    expect(importedPathsOf(JSON.stringify({ rules: [] }))).toEqual([]);
  });
});

describe('isReachableFolder — the same reach a `project` rule already has, D-10', () => {
  const roots = [{ path: '/srv/projects' }, { path: '/srv/app' }];

  it('is true for a root itself', () => {
    expect(isReachableFolder('/srv/app', roots)).toBe(true);
  });

  it('is true for a subfolder of a root', () => {
    expect(isReachableFolder('/srv/app/sub', roots)).toBe(true);
  });

  it('is false for a path outside every root', () => {
    expect(isReachableFolder('/elsewhere', roots)).toBe(false);
  });

  it('is false for a path that merely starts with a root’s own text, not its own subfolder', () => {
    expect(isReachableFolder('/srv/application', roots)).toBe(false);
  });

  it('is false with no roots at all', () => {
    expect(isReachableFolder('/srv/app', [])).toBe(false);
  });
});

describe('importRowsOf — one row per preview item, joined with the file’s own path (plan 15, B-31)', () => {
  const roots = [{ path: '/srv/projects' }];

  it('needs no remap for an `always`-scoped item, whatever its path', () => {
    const items = [item({ index: 0, scope: 'always' })];
    const rows = importRowsOf(items, ['/elsewhere'], roots, new Set());

    expect(rows[0]?.needsRemap).toBe(false);
  });

  it('needs no remap for a `project` item whose path is already reachable', () => {
    const items = [item({ index: 0, scope: 'project' })];
    const rows = importRowsOf(items, ['/srv/projects/app'], roots, new Set());

    expect(rows[0]?.needsRemap).toBe(false);
  });

  it('needs a remap for a `project` item whose path is reachable by none of the roots', () => {
    const items = [item({ index: 0, scope: 'project' })];
    const rows = importRowsOf(items, ['/elsewhere'], roots, new Set());

    expect(rows[0]?.needsRemap).toBe(true);
    expect(rows[0]?.projectPath).toBe('/elsewhere');
  });

  it('stops needing a remap once that same path was already remapped', () => {
    const items = [item({ index: 0, scope: 'project' })];
    const rows = importRowsOf(items, ['/elsewhere'], roots, new Set(['/elsewhere']));

    expect(rows[0]?.needsRemap).toBe(false);
  });

  it('needs no remap for a `project` item with no path at all', () => {
    const items = [item({ index: 0, scope: 'project' })];
    const rows = importRowsOf(items, [null], roots, new Set());

    expect(rows[0]?.needsRemap).toBe(false);
    expect(rows[0]?.projectPath).toBeNull();
  });

  it('reads `blocked` from the same D-09 width gate "Modelos" uses', () => {
    const items = [item({ index: 0, decision: 'allow', breadth: 'unbounded' })];
    const rows = importRowsOf(items, null, roots, new Set());

    expect(rows[0]?.blocked).toBe(true);
  });

  it('falls back to no path at all when `paths` itself is null (an unparsable file)', () => {
    const items = [item({ index: 0, scope: 'project' })];
    const rows = importRowsOf(items, null, roots, new Set());

    expect(rows[0]?.projectPath).toBeNull();
    expect(rows[0]?.needsRemap).toBe(false);
  });
});

describe('importBatchStateOf — every derived bit ImportReview reads, per item (plan 15, B-31, S-206)', () => {
  it('cannot confirm with nothing accepted', () => {
    const state = importBatchStateOf({
      rows: [],
      included: new Set(),
      acknowledgedBroad: new Set(),
      expiresAt: '2027-01-01T00:00:00.000Z',
      submitting: false,
    });

    expect(state.accepted).toEqual([]);
    expect(state.canConfirm).toBe(false);
  });

  it('accepts an included, unblocked, non-broad item', () => {
    const rows = [row({ item: item({ index: 0 }) })];
    const state = importBatchStateOf({
      rows,
      included: new Set([0]),
      acknowledgedBroad: new Set(),
      expiresAt: '2027-01-01T00:00:00.000Z',
      submitting: false,
    });

    expect(state.accepted).toEqual([0]);
    expect(state.canConfirm).toBe(true);
  });

  it('excludes a row not in `included`', () => {
    const rows = [row({ item: item({ index: 0 }) })];
    const state = importBatchStateOf({
      rows,
      included: new Set(),
      acknowledgedBroad: new Set(),
      expiresAt: '2027-01-01T00:00:00.000Z',
      submitting: false,
    });

    expect(state.accepted).toEqual([]);
  });

  it('excludes an `invalid` item even if included', () => {
    const rows = [row({ item: item({ index: 0, verdict: 'invalid', code: 'INVALID_INPUT' }) })];
    const state = importBatchStateOf({
      rows,
      included: new Set([0]),
      acknowledgedBroad: new Set(),
      expiresAt: '2027-01-01T00:00:00.000Z',
      submitting: false,
    });

    expect(state.accepted).toEqual([]);
  });

  it('excludes a blocked item even if included', () => {
    const rows = [row({ item: item({ index: 0 }), blocked: true })];
    const state = importBatchStateOf({
      rows,
      included: new Set([0]),
      acknowledgedBroad: new Set(),
      expiresAt: '2027-01-01T00:00:00.000Z',
      submitting: false,
    });

    expect(state.accepted).toEqual([]);
  });

  it('cannot confirm while any included row still needs a remap, even with others accepted', () => {
    const rows = [
      row({ item: item({ index: 0 }) }),
      row({ item: item({ index: 1 }), needsRemap: true, projectPath: '/elsewhere' }),
    ];
    const state = importBatchStateOf({
      rows,
      included: new Set([0, 1]),
      acknowledgedBroad: new Set(),
      expiresAt: '2027-01-01T00:00:00.000Z',
      submitting: false,
    });

    expect(state.needsRemap).toBe(true);
    expect(state.canConfirm).toBe(false);
  });

  it('needs its own acknowledgement for each accepted broad item, independently', () => {
    const rows = [
      row({ item: item({ index: 0, breadth: 'broad' }) }),
      row({ item: item({ index: 1, breadth: 'broad' }) }),
    ];
    const state = importBatchStateOf({
      rows,
      included: new Set([0, 1]),
      acknowledgedBroad: new Set([0]),
      expiresAt: '2027-01-01T00:00:00.000Z',
      submitting: false,
    });

    expect(state.needsAcknowledge).toBe(true);
    expect(state.accepted).toEqual([0]);
    expect(state.acknowledgeBroad).toEqual([0]);
    expect(state.canConfirm).toBe(false);
  });

  it('confirms once every accepted broad item is acknowledged on its own', () => {
    const rows = [
      row({ item: item({ index: 0, breadth: 'broad' }) }),
      row({ item: item({ index: 1, breadth: 'broad' }) }),
    ];
    const state = importBatchStateOf({
      rows,
      included: new Set([0, 1]),
      acknowledgedBroad: new Set([0, 1]),
      expiresAt: '2027-01-01T00:00:00.000Z',
      submitting: false,
    });

    expect(state.needsAcknowledge).toBe(false);
    expect(state.accepted).toEqual([0, 1]);
    expect(state.acknowledgeBroad).toEqual([0, 1]);
    expect(state.canConfirm).toBe(true);
  });

  it('reads validityDecision as `allow` when any row at all is `allow`, whether accepted or not', () => {
    const rows = [
      row({ item: item({ index: 0, decision: 'deny' }) }),
      row({ item: item({ index: 1, decision: 'allow' }) }),
    ];
    const state = importBatchStateOf({
      rows,
      included: new Set(),
      acknowledgedBroad: new Set(),
      expiresAt: null,
      submitting: false,
    });

    expect(state.validityDecision).toBe('allow');
  });

  it('reads validityDecision as `deny` when every row is `deny`', () => {
    const rows = [row({ item: item({ index: 0, decision: 'deny' }) })];
    const state = importBatchStateOf({
      rows,
      included: new Set(),
      acknowledgedBroad: new Set(),
      expiresAt: null,
      submitting: false,
    });

    expect(state.validityDecision).toBe('deny');
  });

  it('cannot confirm before a validity is picked', () => {
    const rows = [row({ item: item({ index: 0 }) })];
    const state = importBatchStateOf({
      rows,
      included: new Set([0]),
      acknowledgedBroad: new Set(),
      expiresAt: null,
      submitting: false,
    });

    expect(state.canConfirm).toBe(false);
  });

  it('cannot confirm while already submitting', () => {
    const rows = [row({ item: item({ index: 0 }) })];
    const state = importBatchStateOf({
      rows,
      included: new Set([0]),
      acknowledgedBroad: new Set(),
      expiresAt: '2027-01-01T00:00:00.000Z',
      submitting: true,
    });

    expect(state.canConfirm).toBe(false);
  });
});
