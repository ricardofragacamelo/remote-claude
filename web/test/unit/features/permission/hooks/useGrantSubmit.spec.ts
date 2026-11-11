import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useGrantSubmit } from '@/features/permission/hooks/useGrantSubmit';
import type { GrantRuleInput, PermissionRule } from '@/features/permission/types/rule';
import { api } from '@/shared/api/api';

const input: GrantRuleInput = {
  pattern: 'shell(git status)',
  decision: 'allow',
  scope: 'always',
  expiresAt: '',
};

const rule = { id: 'rule-1' } as PermissionRule;

function setup(onFolderRefused: () => void = vi.fn()) {
  const onGranted = vi.fn();
  const hook = renderHook(() => useGrantSubmit(input, onGranted, onFolderRefused));
  return { ...hook, onGranted };
}

describe('useGrantSubmit — the wizard’s own one write (plan 15, B-27)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls onGranted with the created rule, on success', async () => {
    vi.spyOn(api, 'post').mockResolvedValue(rule);
    const { result, onGranted } = setup();

    act(() => {
      result.current.confirm();
    });

    await waitFor(() => {
      expect(onGranted).toHaveBeenCalledWith(rule);
    });
    expect(result.current.submitting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('reflects submitting while the write is in flight', async () => {
    let resolve!: (value: PermissionRule) => void;
    vi.spyOn(api, 'post').mockReturnValue(
      new Promise((yes) => {
        resolve = yes;
      }),
    );
    const { result } = setup();

    act(() => {
      result.current.confirm();
    });

    await waitFor(() => {
      expect(result.current.submitting).toBe(true);
    });

    act(() => {
      resolve(rule);
    });

    await waitFor(() => {
      expect(result.current.submitting).toBe(false);
    });
  });

  it('calls onFolderRefused exactly once when the folder left the allowlist (S-195)', async () => {
    const error = { code: 'WORKSPACE_NOT_ALLOWED', messageKey: 'x', params: {} };
    vi.spyOn(api, 'post').mockRejectedValue(error);
    const onFolderRefused = vi.fn();
    const { result } = setup(onFolderRefused);

    act(() => {
      result.current.confirm();
    });

    await waitFor(() => {
      expect(onFolderRefused).toHaveBeenCalledTimes(1);
    });
    expect(result.current.error).toEqual(error);
  });

  it('calls onFolderRefused for a workspace that stopped existing, too', async () => {
    const error = { code: 'WORKSPACE_NOT_FOUND', messageKey: 'x', params: {} };
    vi.spyOn(api, 'post').mockRejectedValue(error);
    const onFolderRefused = vi.fn();
    const { result } = setup(onFolderRefused);

    act(() => {
      result.current.confirm();
    });

    await waitFor(() => {
      expect(onFolderRefused).toHaveBeenCalledTimes(1);
    });
  });

  it('never calls onFolderRefused for an unrelated error', async () => {
    const error = { code: 'PERMISSION_RULE_TOO_BROAD', messageKey: 'x', params: {} };
    vi.spyOn(api, 'post').mockRejectedValue(error);
    const onFolderRefused = vi.fn();
    const { result } = setup(onFolderRefused);

    act(() => {
      result.current.confirm();
    });

    await waitFor(() => {
      expect(result.current.error).toEqual(error);
    });
    expect(onFolderRefused).not.toHaveBeenCalled();
  });

  it('guards a doubled click — the same draft pressed twice sends one write, not two (S-194)', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(rule);
    const { result, onGranted } = setup();

    act(() => {
      result.current.confirm();
      result.current.confirm();
    });

    await waitFor(() => {
      expect(onGranted).toHaveBeenCalled();
    });
    expect(post).toHaveBeenCalledTimes(1);
  });
});
