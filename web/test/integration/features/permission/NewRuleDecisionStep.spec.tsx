import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NewRuleDecisionStep } from '@/features/permission/components/NewRuleDecisionStep';
import { render, translator } from '../../../support/render';

const t = translator('en');

describe('step 3 of the rule-authoring wizard, Allow or Block — plan 15, B-27', () => {
  it('names each choice by what it means, never a bare word', () => {
    render(<NewRuleDecisionStep decision={null} onPick={() => {}} />);

    expect(
      screen.getByRole('radiogroup', { name: t('rules.wizard.decisionStepLabel') }),
    ).toBeInTheDocument();
    expect(screen.getByText(t('rules.decision.allow'))).toBeVisible();
    expect(screen.getByText(t('rules.wizard.decisionAllowBody'))).toBeVisible();
    expect(screen.getByText(t('rules.decision.deny'))).toBeVisible();
    expect(screen.getByText(t('rules.wizard.decisionDenyBody'))).toBeVisible();
  });

  it('starts with neither choice checked when the draft has none yet', () => {
    render(<NewRuleDecisionStep decision={null} onPick={() => {}} />);

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    radios.forEach((radio) => {
      expect(radio).toHaveAttribute('aria-checked', 'false');
    });
  });

  it('shows allow as checked when the draft already picked it', () => {
    render(<NewRuleDecisionStep decision="allow" onPick={() => {}} />);

    expect(
      screen.getByRole('radio', { name: new RegExp(t('rules.decision.allow')) }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByRole('radio', { name: new RegExp(t('rules.decision.deny')) }),
    ).toHaveAttribute('aria-checked', 'false');
  });

  it('shows deny as checked when the draft already picked it', () => {
    render(<NewRuleDecisionStep decision="deny" onPick={() => {}} />);

    expect(
      screen.getByRole('radio', { name: new RegExp(t('rules.decision.deny')) }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByRole('radio', { name: new RegExp(t('rules.decision.allow')) }),
    ).toHaveAttribute('aria-checked', 'false');
  });

  it('picks allow on click', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<NewRuleDecisionStep decision={null} onPick={onPick} />);

    await user.click(screen.getByRole('radio', { name: new RegExp(t('rules.decision.allow')) }));

    expect(onPick).toHaveBeenCalledWith('allow');
  });

  it('picks deny on click — the same weight as allow, never a lesser option', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<NewRuleDecisionStep decision="allow" onPick={onPick} />);

    await user.click(screen.getByRole('radio', { name: new RegExp(t('rules.decision.deny')) }));

    expect(onPick).toHaveBeenCalledWith('deny');
    expect(onPick).toHaveBeenCalledTimes(1);
  });
});
