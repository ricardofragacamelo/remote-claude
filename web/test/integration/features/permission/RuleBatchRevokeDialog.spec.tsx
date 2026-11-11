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

/** What revoking neither rule would bring back — the simulation panel embedded in the dialog
 * (S-201) asks for this as soon as it mounts, same as the preview did for the wizard (B-27). */
const SIMULATION = {
  counts: { unchanged: 1, wouldAutoAllow: 0, wouldAutoDeny: 0, wouldAsk: 0 },
  changes: [],
  withoutFolder: 0,
  assumedMode: 'ask' as const,
};

/** `api.post`, answering `/permission-rules/simulate` only — the caller adds its own handling for
 * whatever it is itself testing (`/permission-rules/revoke`, `/restore`). */
function mockSimulate(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(api, 'post').mockImplementation((path: unknown) => {
    if (String(path).includes('/simulate')) {
      return Promise.resolve(SIMULATION);
    }
    return Promise.reject(new Error(`unexpected POST ${String(path)}`));
  });
}

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
        onOpenRule={vi.fn()}
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

  it('cancels without revoking anything — the simulation preview reads, never writes', async () => {
    const post = mockSimulate();
    const { onOpenChange } = renderDialog();

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/permission-rules/simulate', expect.anything());
    });

    await userEvent.click(screen.getByRole('button', { name: t('rules.batch.cancel') }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(post).not.toHaveBeenCalledWith('/permission-rules/revoke', expect.anything());
  });

  it('revokes, then undoes from the toast — the dialog has already closed by then', async () => {
    const post = vi.spyOn(api, 'post').mockImplementation((path: unknown, body?: unknown) => {
      const p = String(path);
      if (p.includes('/simulate')) return Promise.resolve(SIMULATION);
      if (p === '/permission-rules/revoke') {
        return Promise.resolve({
          rules: [
            { ...ruleA, status: 'revoked' },
            { ...ruleB, status: 'revoked' },
          ],
        });
      }
      if (p === '/permission-rules/restore') return Promise.resolve({ rules: [ruleA, ruleB] });
      return Promise.reject(new Error(`unexpected POST ${p} ${JSON.stringify(body)}`));
    });
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
              onOpenRule={vi.fn()}
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
      expect(post).toHaveBeenCalledWith('/permission-rules/restore', {
        ids: expect.arrayContaining([ruleA.id, ruleB.id]),
      });
    });
  });

  it('shows the failure beside this lot, and keeps the dialog open', async () => {
    const error = { code: 'INTERNAL_ERROR', messageKey: 'common.error.unexpected', params: {} };
    vi.spyOn(api, 'post').mockImplementation((path: unknown) => {
      const p = String(path);
      if (p.includes('/simulate')) return Promise.resolve(SIMULATION);
      if (p === '/permission-rules/revoke') return Promise.reject(error);
      return Promise.reject(new Error(`unexpected POST ${p}`));
    });
    const { onOpenChange } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: t('rules.batch.confirmRevoke') }));

    expect(await screen.findByText(t('common.error.unexpected'))).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('opens a rule the simulation found still answering, from its own "open" button — S-201', async () => {
    const changedEntry = {
      id: 'entry-1',
      sessionId: 'session-1',
      toolUseId: 'tool-1',
      toolName: 'Bash',
      kind: 'shell',
      input: {},
      decision: 'allowed',
      at: '2026-09-20T10:00:00.000Z',
      traceId: null,
      verdict: null,
    };
    const otherRule = { ...ruleA, id: 'rule_other', pattern: 'shell(other:*)' };
    vi.spyOn(api, 'post').mockImplementation((path: unknown) => {
      if (String(path).includes('/simulate')) {
        return Promise.resolve({
          counts: { unchanged: 0, wouldAutoAllow: 0, wouldAutoDeny: 0, wouldAsk: 1 },
          changes: [
            { before: 'allow', after: 'ask', entry: changedEntry, answeringRule: otherRule },
          ],
          withoutFolder: 0,
          assumedMode: 'ask' as const,
        });
      }
      return Promise.reject(new Error(`unexpected POST ${String(path)}`));
    });
    const onOpenRule = vi.fn();
    renderDialog({ onOpenRule });

    await userEvent.click(
      await screen.findByRole('button', { name: t('permission.ruleDetail.openInvolvedRule') }),
    );

    expect(onOpenRule).toHaveBeenCalledWith('rule_other');
  });
});
