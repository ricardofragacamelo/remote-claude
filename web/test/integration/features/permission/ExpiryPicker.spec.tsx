import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ExpiryPicker } from '@/features/permission/components/ExpiryPicker';
import {
  dateInputValueOf,
  expiryFromShortcut,
} from '@/features/permission/lib/rule-expiry-shortcuts';
import type { PermissionDecision } from '@/features/permission/types/permission';
import { render, translator } from '../../../support/render';

const t = translator('en');
const NOW = new Date('2026-09-20T10:00:00.000Z').getTime();

function sevenDaysOut(): string {
  return dateInputValueOf(expiryFromShortcut(7, new Date(NOW)).toISOString());
}

/** A host with its own `date`/`error` state, the way every caller of this picker owns them. */
function Host({
  decision = 'allow',
  error = null,
  onPick = () => {},
}: {
  readonly decision?: PermissionDecision;
  readonly error?: { readonly key: string } | null;
  onPick?(next: string): void;
}): React.JSX.Element {
  const [date, setDate] = useState('');

  return (
    <ExpiryPicker
      date={date}
      decision={decision}
      error={error}
      now={NOW}
      onPick={(next) => {
        setDate(next);
        onPick(next);
      }}
    />
  );
}

describe('the expiry picker — plan 15, B-23/B-27', () => {
  it('offers three shortcuts for an allow, a fourth for a deny', () => {
    render(<Host decision="allow" />);
    expect(
      screen.getByRole('button', { name: t('permission.ruleExpiry.shortcut7') }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: t('permission.ruleExpiry.shortcut365') }),
    ).toBeNull();

    render(<Host decision="deny" />);
    expect(
      screen.getByRole('button', { name: t('permission.ruleExpiry.shortcut365') }),
    ).toBeInTheDocument();
  });

  it("picks the shortcut's own date, counted from `now`", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Host onPick={onPick} />);

    await user.click(screen.getByRole('button', { name: t('permission.ruleExpiry.shortcut7') }));

    expect(onPick).toHaveBeenCalledWith(sevenDaysOut());
  });

  it('picks whatever the free date field is set to', () => {
    const onPick = vi.fn();
    render(<Host onPick={onPick} />);

    fireEvent.change(screen.getByLabelText(t('permission.ruleExpiry.freeDate')), {
      target: { value: '2026-12-01' },
    });

    expect(onPick).toHaveBeenCalledWith('2026-12-01');
  });

  it('shows no error line when there is none', () => {
    render(<Host error={null} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the translated error when there is one', () => {
    render(<Host error={{ key: 'permission.ruleExpiry.invalid' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent(t('permission.ruleExpiry.invalid'));
  });
});
