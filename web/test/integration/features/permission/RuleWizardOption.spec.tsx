import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RuleWizardOption } from '@/features/permission/components/RuleWizardOption';
import { render } from '../../../support/render';

const LABEL = 'shell';

describe('the wizard option — plan 15, B-27', () => {
  it('renders its children inside a radio, checked when pressed', () => {
    render(
      <RuleWizardOption pressed onClick={() => {}}>
        {LABEL}
      </RuleWizardOption>,
    );

    expect(screen.getByRole('radio', { name: LABEL })).toHaveAttribute('aria-checked', 'true');
  });

  it('is unchecked when not pressed', () => {
    render(
      <RuleWizardOption pressed={false} onClick={() => {}}>
        {LABEL}
      </RuleWizardOption>,
    );

    expect(screen.getByRole('radio', { name: LABEL })).toHaveAttribute('aria-checked', 'false');
  });

  it('calls back on a click', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <RuleWizardOption pressed={false} onClick={onClick}>
        {LABEL}
      </RuleWizardOption>,
    );

    await user.click(screen.getByRole('radio', { name: LABEL }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('calls back from the keyboard too — a native button needs no handler of its own', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <RuleWizardOption pressed={false} onClick={onClick}>
        {LABEL}
      </RuleWizardOption>,
    );

    await user.tab();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');

    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("carries the caller's own class, for the layout each step picks", () => {
    render(
      <RuleWizardOption pressed={false} onClick={() => {}} className="my-layout">
        {LABEL}
      </RuleWizardOption>,
    );

    expect(screen.getByRole('radio', { name: LABEL })).toHaveClass('my-layout');
  });
});
