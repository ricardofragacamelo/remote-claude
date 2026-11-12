import { describe, expect, it, vi } from 'vitest';
import type { TFunction } from 'i18next';

import {
  closeDialogOnApplied,
  confirmRuleImportApply,
  withAppliedToast,
} from '@/features/permission/lib/confirm-import';
import type { RuleImportResult } from '@/features/permission/types/rule';

const RESULT: RuleImportResult = { counts: { created: 2, existing: 1 }, rules: [] };

function fakeT(): TFunction {
  return ((key: string, params?: Record<string, unknown>) =>
    params === undefined ? key : `${key}:${JSON.stringify(params)}`) as TFunction;
}

describe('confirmRuleImportApply — the one call "Modelos" and "Importar" both make (plan 15, B-30, B-31)', () => {
  it('sends accept, acknowledgeBroad, digest and expiresAt, and reports the result once resolved', async () => {
    const apply = vi.fn().mockResolvedValue(RESULT);
    const onApplied = vi.fn();

    confirmRuleImportApply({
      apply,
      file: '{"rules":[]}',
      digest: 'sha-1',
      accept: [0, 1],
      acknowledgeBroad: [1],
      expiresAt: '2027-01-01T00:00:00.000Z',
      onApplied,
    });

    await vi.waitFor(() => {
      expect(onApplied).toHaveBeenCalledWith(RESULT);
    });
    expect(apply).toHaveBeenCalledWith({
      file: '{"rules":[]}',
      digest: 'sha-1',
      accept: [0, 1],
      acknowledgeBroad: [1],
      expiresAt: '2027-01-01T00:00:00.000Z',
    });
  });

  it('carries folderMap along when given one', async () => {
    const apply = vi.fn().mockResolvedValue(RESULT);

    confirmRuleImportApply({
      apply,
      file: '{}',
      digest: 'sha-1',
      accept: [0],
      acknowledgeBroad: [],
      folderMap: { '/elsewhere': '/srv/app' },
      expiresAt: '2027-01-01T00:00:00.000Z',
      onApplied: vi.fn(),
    });

    await vi.waitFor(() => {
      expect(apply).toHaveBeenCalledWith(
        expect.objectContaining({ folderMap: { '/elsewhere': '/srv/app' } }),
      );
    });
  });

  it('never sends a `folderMap` field at all when none is given', async () => {
    const apply = vi.fn().mockResolvedValue(RESULT);

    confirmRuleImportApply({
      apply,
      file: '{}',
      digest: 'sha-1',
      accept: [0],
      acknowledgeBroad: [],
      expiresAt: '2027-01-01T00:00:00.000Z',
      onApplied: vi.fn(),
    });

    await vi.waitFor(() => {
      expect(apply).toHaveBeenCalled();
    });
    const [sent] = apply.mock.calls[0] as [Record<string, unknown>];
    expect('folderMap' in sent).toBe(false);
  });

  it('never calls onApplied when `apply` resolves to null (the apply call was refused)', async () => {
    const apply = vi.fn().mockResolvedValue(null);
    const onApplied = vi.fn();

    confirmRuleImportApply({
      apply,
      file: '{}',
      digest: 'sha-1',
      accept: [0],
      acknowledgeBroad: [],
      expiresAt: '2027-01-01T00:00:00.000Z',
      onApplied,
    });

    await vi.waitFor(() => {
      expect(apply).toHaveBeenCalled();
    });
    expect(onApplied).not.toHaveBeenCalled();
  });
});

describe('withAppliedToast — the toast both dialogs raise on a successful apply (plan 15, B-30, B-31)', () => {
  // `sonner`'s own `toast()` is exercised for real here (nothing mounts a `<Toaster/>` in this
  // unit test) — it only pushes to its own internal queue, so this never throws; the toast
  // actually rendering, translated, is what the two dialogs' own integration specs already cover.
  it('calls through to the real toast without throwing, and forwards the result to onApplied', () => {
    const onApplied = vi.fn();
    const callback = withAppliedToast(fakeT(), 'rules.import.appliedToast', onApplied);

    expect(() => {
      callback(RESULT);
    }).not.toThrow();

    expect(onApplied).toHaveBeenCalledWith(RESULT);
  });

  it('forwards the result whichever message key it was given', () => {
    const onApplied = vi.fn();
    const callback = withAppliedToast(fakeT(), 'rules.templates.appliedToast', onApplied);

    callback(RESULT);

    expect(onApplied).toHaveBeenCalledWith(RESULT);
  });
});

describe('closeDialogOnApplied — both dialogs close themselves on a successful apply (plan 15, B-30, B-31)', () => {
  it('closes the dialog and forwards the result to onApplied', () => {
    const onOpenChange = vi.fn();
    const onApplied = vi.fn();
    const callback = closeDialogOnApplied(onOpenChange, onApplied);

    callback(RESULT);

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onApplied).toHaveBeenCalledWith(RESULT);
  });
});
