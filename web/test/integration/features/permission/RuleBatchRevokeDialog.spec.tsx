import { useState } from 'react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RuleBatchRevokeDialog } from '@/features/permission/components/RuleBatchRevokeDialog';
import type { PermissionRule } from '@/features/permission/types/rule';
import { Toaster } from '@/shared/components/ui/sonner';
import { api } from '@/shared/api/api';
import { render, translator } from '../../../support/render';

const t = translator('en');

const ruleA: PermissionRule = {
  id: 'rule_a',
  scope: 'always',
  kind: 'shell',
  pattern: 'shell(a:*)',
  decision: 'allow',
  projectPath: null,
  engine: null,
  grantedBy: 'user-1',
  grantedAt: '2026-09-20T10:00:00.000Z',
  expiresAt: '2026-12-19T10:00:00.000Z',
  status: 'active',
  revokedAt: null,
  disabled: null,
};

const ruleB = { ...ruleA, id: 'rule_b', pattern: 'shell(b:*)' };

/** The dialog, with the real `Toaster` the real `toast()` calls need to show anything — the same
 * pattern `RuleExpiryDialog.spec.tsx` (B-23) already established. */
function renderDialog(props: Partial<Parameters<typeof RuleBatchRevokeDialog>[0]> = {}): {
  onOpenChange: ReturnType<typeof vi.fn>;
  onRevoked: ReturnType<typeof vi.fn>;
} {
  const onOpenChange = vi.fn();
  const onRevoked = vi.fn();
  render(
    <>
      <Toaster containerAriaLabel="toasts" />
      <RuleBatchRevokeDialog
        rules={[ruleA, ruleB]}
        open
        onOpenChange={onOpenChange}
        onRevoked={onRevoked}
        {...props}
      />
    </>,
  );
  return { onOpenChange, onRevoked };
}

describe('the batch-revoke dialog — plan 15, B-24', () => {
  // Fake timers, as `RuleExpiryDialog.spec.tsx` (B-23) already found — the real `Toaster`'s own
  // auto-dismiss/exit-animation timers otherwise outlive the test, firing into a jsdom already torn
  // down (`window is not defined`). `shouldAdvanceTime` keeps `userEvent`'s own delays working.
  beforeAll(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date('2026-09-20T10:00:00.000Z') });
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('cancels without sending anything', async () => {
    const post = vi.spyOn(api, 'post');
    const { onOpenChange } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: t('rules.batch.cancel') }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(post).not.toHaveBeenCalled();
  });

  it('revokes, then undoes from the toast — the dialog has already closed by then', async () => {
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValueOnce({
        rules: [
          { ...ruleA, status: 'revoked' },
          { ...ruleB, status: 'revoked' },
        ],
      })
      .mockResolvedValueOnce({ rules: [ruleA, ruleB] });
    const onRevoked = vi.fn();

    // A closing that really closes — the toast's undo button sits outside the dialog, which a
    // merely-mocked `onOpenChange` would leave "open" enough to keep trapping pointer events.
    function Harness(): React.JSX.Element {
      const [open, setOpen] = useState(true);
      return (
        <>
          <Toaster containerAriaLabel="toasts" />
          {open && (
            <RuleBatchRevokeDialog
              rules={[ruleA, ruleB]}
              open
              onOpenChange={setOpen}
              onRevoked={onRevoked}
            />
          )}
        </>
      );
    }
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: t('rules.batch.confirmRevoke') }));

    await waitFor(() => {
      expect(onRevoked).toHaveBeenCalledWith([ruleA.id, ruleB.id]);
    });
    expect(screen.queryByRole('dialog')).toBeNull();

    const toastText = await screen.findByText(t('rules.batch.revokedToast', { count: 2 }));
    const region =
      (toastText.closest('[role="status"], [data-sonner-toast], li') as HTMLElement | null) ??
      document.body;

    await userEvent.click(
      within(region).getByRole('button', { name: t('permission.ruleExpiry.undo') }),
    );

    await waitFor(() => {
      expect(post).toHaveBeenCalledTimes(2);
    });
    expect(post).toHaveBeenLastCalledWith('/permission-rules/restore', {
      ids: expect.arrayContaining([ruleA.id, ruleB.id]),
    });
  });
});
