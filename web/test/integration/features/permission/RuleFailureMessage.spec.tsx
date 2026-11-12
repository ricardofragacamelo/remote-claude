import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';

import { RuleFailureMessage } from '@/features/permission/components/RuleFailureMessage';
import { render, translator } from '../../../support/render';

const t = translator('en');

describe('RuleFailureMessage — takes focus the moment it appears (plan 15, B-32)', () => {
  it('renders the translated message as an alert, focused on mount', () => {
    render(<RuleFailureMessage messageKey="common.error.unexpected" params={{}} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(t('common.error.unexpected'));
    expect(alert).toHaveFocus();
  });

  it('re-focuses when a different failure replaces it without ever unmounting', () => {
    const { rerender } = render(
      <RuleFailureMessage messageKey="common.error.unexpected" params={{}} />,
    );
    const first = screen.getByRole('alert');
    first.blur();
    expect(first).not.toHaveFocus();

    rerender(<RuleFailureMessage messageKey="common.error.offline" params={{}} />);

    expect(screen.getByRole('alert')).toHaveFocus();
    expect(screen.getByRole('alert')).toHaveTextContent(t('common.error.offline'));
  });

  it('interpolates its own params', () => {
    render(
      <RuleFailureMessage
        messageKey="rules.import.rejectedItem"
        params={{ field: 'rules[0]', rule: 'ALREADY_REVOKED' }}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      t('rules.import.rejectedItem', { field: 'rules[0]', rule: 'ALREADY_REVOKED' }),
    );
  });
});
