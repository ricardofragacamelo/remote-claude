import { useState } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { RuleExpiryDialog } from '@/features/permission/components/RuleExpiryDialog';
import {
  dateInputToExpiresAt,
  dateInputValueOf,
  expiryFromShortcut,
} from '@/features/permission/lib/rule-expiry-shortcuts';
import type { PermissionRule } from '@/features/permission/types/rule';
import { Toaster } from '@/shared/components/ui/sonner';
import { api } from '@/shared/api/api';
import { render, translator } from '../../../support/render';

const t = translator('en');
const NOW = new Date('2026-09-20T10:00:00.000Z');

/** What picking the "7 days" shortcut sends — end of that day, in this machine's own zone. */
const sevenDaysOut = dateInputToExpiresAt(
  dateInputValueOf(expiryFromShortcut(7, NOW).toISOString()),
)!;

const nearRule: PermissionRule = {
  id: 'rule_1',
  scope: 'always',
  kind: 'shell',
  pattern: 'shell(git status:*)',
  decision: 'allow',
  projectPath: null,
  engine: null,
  grantedBy: 'auth|42',
  grantedAt: '2026-09-01T10:00:00.000Z',
  expiresAt: '2026-09-22T10:00:00.000Z',
  status: 'active',
  revokedAt: null,
  disabled: null,
  etag: '"etag-1"',
  expiryCeiling: '2027-09-20T10:00:00.000Z',
  reach: { kind: 'shell', form: 'prefix', content: 'git status', excludesCompound: false },
};

const farRule = { ...nearRule, expiresAt: '2027-06-01T10:00:00.000Z' };

/** The dialog, with the real `Toaster` the real `toast()` calls need to show anything — the same
 * polyfills the test setup gives it (`ResizeObserver`, pointer capture) are already in place. */
function renderDialog(props: Omit<Parameters<typeof RuleExpiryDialog>[0], 'open'>): void {
  render(
    <>
      <Toaster containerAriaLabel="toasts" />
      <RuleExpiryDialog {...props} open />
    </>,
  );
}

describe('the extend/shorten dialog — plan 15, B-23', () => {
  beforeAll(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the ceiling, and the shortcuts allow gets — three, never the deny-only fourth', async () => {
    renderDialog({
      rule: nearRule,
      direction: 'extend',
      onOpenChange: () => {},
      onChanged: () => {},
    });

    expect(await screen.findByText(/Sep 20, 2027/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: t('permission.ruleExpiry.shortcut7') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: t('permission.ruleExpiry.shortcut90') }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: t('permission.ruleExpiry.shortcut365') }),
    ).toBeNull();
  });

  it('gives a `deny` rule the one-year shortcut too', () => {
    renderDialog({
      rule: { ...nearRule, decision: 'deny' },
      direction: 'extend',
      onOpenChange: () => {},
      onChanged: () => {},
    });

    expect(
      screen.getByRole('button', { name: t('permission.ruleExpiry.shortcut365') }),
    ).toBeInTheDocument();
  });

  it('estender: a shortcut, a confirm step with the sentence restated, then applies — S-169', async () => {
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({
      ...nearRule,
      expiresAt: sevenDaysOut,
    });
    const onChanged = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog({ rule: nearRule, direction: 'extend', onOpenChange, onChanged });

    await userEvent.click(
      screen.getByRole('button', { name: t('permission.ruleExpiry.shortcut7') }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: t('permission.ruleExpiry.continue') }),
    );

    expect(screen.getByText(/do `git status`/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t('permission.ruleExpiry.shortcut7') })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: t('permission.ruleExpiry.apply') }));

    await waitFor(() => {
      expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ id: 'rule_1' }));
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(patch).toHaveBeenCalledWith(
      '/permission-rules/rule_1',
      { expiresAt: sevenDaysOut },
      { headers: { 'if-match': '"etag-1"' } },
    );
    expect(await screen.findByText(t('permission.ruleExpiry.extendedToast'))).toBeInTheDocument();
    // Estender offers nothing to undo — only encurtar's own toast does (S-170).
    expect(screen.queryByRole('button', { name: t('permission.ruleExpiry.undo') })).toBeNull();
  });

  it('backs out of the confirm step without sending anything', async () => {
    const patch = vi.spyOn(api, 'patch');
    renderDialog({
      rule: nearRule,
      direction: 'extend',
      onOpenChange: () => {},
      onChanged: () => {},
    });

    await userEvent.click(
      screen.getByRole('button', { name: t('permission.ruleExpiry.shortcut7') }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: t('permission.ruleExpiry.continue') }),
    );
    await userEvent.click(screen.getByRole('button', { name: t('permission.ruleExpiry.back') }));

    expect(
      screen.getByRole('button', { name: t('permission.ruleExpiry.shortcut7') }),
    ).toBeInTheDocument();
    expect(patch).not.toHaveBeenCalled();
  });

  it('encurtar: applies directly, with "desfazer" offered in the toast — S-170', async () => {
    const patch = vi
      .spyOn(api, 'patch')
      .mockResolvedValueOnce({ ...farRule, expiresAt: sevenDaysOut })
      .mockResolvedValueOnce(farRule);
    const onChanged = vi.fn();

    // A closing that really closes — the undo button the toast offers sits outside the dialog,
    // which a merely-mocked `onOpenChange` would leave "open" enough to keep trapping pointer
    // events, the same way `RuleDetailPanel` really closes it.
    function Harness(): React.JSX.Element {
      const [open, setOpen] = useState(true);
      return (
        <>
          <Toaster containerAriaLabel="toasts" />
          {open && (
            <RuleExpiryDialog
              rule={farRule}
              direction="shorten"
              open
              onOpenChange={setOpen}
              onChanged={onChanged}
            />
          )}
        </>
      );
    }
    render(<Harness />);

    await userEvent.click(
      screen.getByRole('button', { name: t('permission.ruleExpiry.shortcut7') }),
    );
    await userEvent.click(screen.getByRole('button', { name: t('permission.ruleExpiry.apply') }));

    const toast = await screen.findByText(t('permission.ruleExpiry.shortenedToast'));
    const region =
      (toast.closest('[role="status"], [data-sonner-toast], li') as HTMLElement | null) ??
      document.body;

    await userEvent.click(
      within(region).getByRole('button', { name: t('permission.ruleExpiry.undo') }),
    );

    await waitFor(() => {
      expect(patch).toHaveBeenCalledTimes(2);
    });
    expect(patch).toHaveBeenLastCalledWith(
      '/permission-rules/rule_1',
      { expiresAt: farRule.expiresAt },
      { headers: { 'if-match': '"etag-1"' } },
    );
  });

  it('shows an inline error, and disables Apply, for a date that does not fit the direction', () => {
    renderDialog({
      rule: nearRule,
      direction: 'shorten',
      onOpenChange: () => {},
      onChanged: () => {},
    });

    const input = screen.getByLabelText(t('permission.ruleExpiry.freeDate'));
    fireEvent.change(input, { target: { value: '2026-10-01' } });

    expect(screen.getByText(t('permission.ruleExpiry.mustBeSooner'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('permission.ruleExpiry.apply') })).toBeDisabled();
  });

  it('says a date that does not parse cannot be sent, and sends nothing if asked anyway', () => {
    const patch = vi.spyOn(api, 'patch');
    renderDialog({
      rule: nearRule,
      direction: 'shorten',
      onOpenChange: () => {},
      onChanged: () => {},
    });

    const input = screen.getByLabelText(t('permission.ruleExpiry.freeDate'));
    fireEvent.change(input, { target: { value: '' } });

    expect(screen.getByText(t('permission.ruleExpiry.invalid'))).toBeInTheDocument();
    const apply = screen.getByRole('button', { name: t('permission.ruleExpiry.apply') });
    expect(apply).toBeDisabled();

    // `disabled` already keeps a real click out — this is the guard behind it, in case it did not.
    fireEvent.click(apply);
    expect(patch).not.toHaveBeenCalled();
  });

  it('estender: a date no later than what the rule already has cannot be sent', () => {
    renderDialog({
      rule: nearRule,
      direction: 'extend',
      onOpenChange: () => {},
      onChanged: () => {},
    });

    const input = screen.getByLabelText(t('permission.ruleExpiry.freeDate'));
    fireEvent.change(input, { target: { value: '2026-09-15' } });

    expect(screen.getByText(t('permission.ruleExpiry.mustBeLater'))).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: t('permission.ruleExpiry.continue') }),
    ).toBeDisabled();
  });

  it('cancels, without sending anything, from the picker step itself', async () => {
    const patch = vi.spyOn(api, 'patch');
    const onOpenChange = vi.fn();
    renderDialog({ rule: nearRule, direction: 'shorten', onOpenChange, onChanged: () => {} });

    await userEvent.click(screen.getByRole('button', { name: t('permission.ruleExpiry.cancel') }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(patch).not.toHaveBeenCalled();
  });

  it('dismissed its own way (Escape) asks to close, same as Cancel', async () => {
    const onOpenChange = vi.fn();
    renderDialog({ rule: nearRule, direction: 'shorten', onOpenChange, onChanged: () => {} });

    await userEvent.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('a rule with no etag to write against sends nothing', async () => {
    const patch = vi.spyOn(api, 'patch');
    renderDialog({
      rule: { ...farRule, etag: null },
      direction: 'shorten',
      onOpenChange: () => {},
      onChanged: () => {},
    });

    await userEvent.click(
      screen.getByRole('button', { name: t('permission.ruleExpiry.shortcut7') }),
    );
    await userEvent.click(screen.getByRole('button', { name: t('permission.ruleExpiry.apply') }));

    expect(patch).not.toHaveBeenCalled();
  });

  it('an unexpected error shows inline, the same failure message every other write uses', async () => {
    vi.spyOn(api, 'patch').mockRejectedValueOnce({
      code: 'INTERNAL_ERROR',
      messageKey: 'common.error.unexpected',
      params: {},
    });
    renderDialog({
      rule: farRule,
      direction: 'shorten',
      onOpenChange: () => {},
      onChanged: () => {},
    });

    await userEvent.click(
      screen.getByRole('button', { name: t('permission.ruleExpiry.shortcut7') }),
    );
    await userEvent.click(screen.getByRole('button', { name: t('permission.ruleExpiry.apply') }));

    expect(await screen.findByText(t('common.error.unexpected'))).toBeInTheDocument();
  });

  it('an undo that itself does not land is silent, not a second toast or a thrown error', async () => {
    vi.spyOn(api, 'patch')
      .mockResolvedValueOnce({ ...farRule, expiresAt: sevenDaysOut })
      .mockRejectedValueOnce({ code: 'PERMISSION_RULE_STATE_CONFLICT' });
    const get = vi.spyOn(api, 'get').mockResolvedValueOnce({ ...farRule, status: 'revoked' });
    const onChanged = vi.fn();

    function Harness(): React.JSX.Element {
      const [open, setOpen] = useState(true);
      return (
        <>
          <Toaster containerAriaLabel="toasts" />
          {open && (
            <RuleExpiryDialog
              rule={farRule}
              direction="shorten"
              open
              onOpenChange={setOpen}
              onChanged={onChanged}
            />
          )}
        </>
      );
    }
    render(<Harness />);

    await userEvent.click(
      screen.getByRole('button', { name: t('permission.ruleExpiry.shortcut7') }),
    );
    await userEvent.click(screen.getByRole('button', { name: t('permission.ruleExpiry.apply') }));

    const toast = await screen.findByText(t('permission.ruleExpiry.shortenedToast'));
    const region =
      (toast.closest('[role="status"], [data-sonner-toast], li') as HTMLElement | null) ??
      document.body;

    await userEvent.click(
      within(region).getByRole('button', { name: t('permission.ruleExpiry.undo') }),
    );

    await waitFor(() => {
      expect(get).toHaveBeenCalledWith('/permission-rules/rule_1');
    });
    // The undo's own write lost the race — nothing pretends it landed: a second call to `onChanged`
    // would be the dialog telling the panel the rule now has the validity the undo asked for, when
    // it does not.
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('a `412`: reloads, says so inline, and keeps the dialog open — S-171', async () => {
    vi.spyOn(api, 'patch').mockRejectedValueOnce({ code: 'PERMISSION_RULE_CHANGED' });
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      ...nearRule,
      expiresAt: '2026-09-23T10:00:00.000Z',
    });
    const onChanged = vi.fn();
    const onOpenChange = vi.fn();
    renderDialog({ rule: nearRule, direction: 'shorten', onOpenChange, onChanged });

    const input = screen.getByLabelText(t('permission.ruleExpiry.freeDate'));
    fireEvent.change(input, { target: { value: '2026-09-21' } });
    await userEvent.click(screen.getByRole('button', { name: t('permission.ruleExpiry.apply') }));

    expect(await screen.findByText(t('permission.error.ruleChanged'))).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: '2026-09-23T10:00:00.000Z' }),
    );
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('a `409`: the real state, translated, and the dialog closes — S-172', async () => {
    vi.spyOn(api, 'patch').mockRejectedValueOnce({ code: 'PERMISSION_RULE_STATE_CONFLICT' });
    vi.spyOn(api, 'get').mockResolvedValueOnce({ ...nearRule, status: 'revoked' });
    const onOpenChange = vi.fn();
    renderDialog({ rule: nearRule, direction: 'shorten', onOpenChange, onChanged: () => {} });

    const input = screen.getByLabelText(t('permission.ruleExpiry.freeDate'));
    fireEvent.change(input, { target: { value: '2026-09-21' } });
    await userEvent.click(screen.getByRole('button', { name: t('permission.ruleExpiry.apply') }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    expect(
      await screen.findByText(
        t('permission.error.ruleStateConflict', { status: t('rules.tabs.revoked') }),
      ),
    ).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <RuleExpiryDialog
        rule={nearRule}
        direction="extend"
        open
        onOpenChange={() => {}}
        onChanged={() => {}}
      />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
