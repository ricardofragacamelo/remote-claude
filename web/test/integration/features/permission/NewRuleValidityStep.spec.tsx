import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';

import { NewRuleValidityStep } from '@/features/permission/components/NewRuleValidityStep';
import {
  dateInputToExpiresAt,
  dateInputValueOf,
  expiryFromShortcut,
} from '@/features/permission/lib/rule-expiry-shortcuts';
import { render, translator } from '../../../support/render';

const t = translator('en');
const NOW = new Date('2026-09-20T10:00:00.000Z');

function shortcutResult(days: number): string {
  return dateInputToExpiresAt(dateInputValueOf(expiryFromShortcut(days, NOW).toISOString()))!;
}

describe('step 5 of the rule-authoring wizard, validity — plan 15, B-27', () => {
  beforeAll(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('starts with no date picked when the draft carries none yet', () => {
    render(<NewRuleValidityStep decision="allow" expiresAt={null} onPick={() => {}} />);

    expect(screen.getByLabelText(t('permission.ruleExpiry.freeDate'))).toHaveValue('');
  });

  it('starts from the expiry the draft already carries, as a date-input value', () => {
    render(
      <NewRuleValidityStep
        decision="allow"
        expiresAt="2026-10-05T23:59:59.999Z"
        onPick={() => {}}
      />,
    );

    expect(screen.getByLabelText(t('permission.ruleExpiry.freeDate'))).toHaveValue('2026-10-05');
  });

  it("offers allow's three shortcuts, never the deny-only fourth", () => {
    render(<NewRuleValidityStep decision="allow" expiresAt={null} onPick={() => {}} />);

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

  it('gives deny the one-year shortcut too (D-04)', () => {
    render(<NewRuleValidityStep decision="deny" expiresAt={null} onPick={() => {}} />);

    expect(
      screen.getByRole('button', { name: t('permission.ruleExpiry.shortcut365') }),
    ).toBeInTheDocument();
  });

  it('picks a shortcut, counted from now (D-14) — the end of that day', async () => {
    const onPick = vi.fn();
    render(<NewRuleValidityStep decision="allow" expiresAt={null} onPick={onPick} />);

    fireEvent.click(screen.getByRole('button', { name: t('permission.ruleExpiry.shortcut7') }));

    expect(onPick).toHaveBeenCalledWith(shortcutResult(7));
    expect(screen.getByLabelText(t('permission.ruleExpiry.freeDate'))).toHaveValue(
      dateInputValueOf(expiryFromShortcut(7, NOW).toISOString()),
    );
  });

  it('types a free, well-formed date and reports its end of day', () => {
    const onPick = vi.fn();
    render(<NewRuleValidityStep decision="allow" expiresAt={null} onPick={onPick} />);

    const input = screen.getByLabelText(t('permission.ruleExpiry.freeDate'));
    fireEvent.change(input, { target: { value: '2026-09-21' } });

    expect(onPick).toHaveBeenCalledWith(dateInputToExpiresAt('2026-09-21'));
    expect(input).toHaveValue('2026-09-21');
  });

  it('keeps what was typed on screen even while it does not yet parse — reporting nothing upward', () => {
    const onPick = vi.fn();
    render(
      <NewRuleValidityStep decision="allow" expiresAt="2026-09-21T23:59:59.999Z" onPick={onPick} />,
    );

    const input = screen.getByLabelText(t('permission.ruleExpiry.freeDate'));
    fireEvent.change(input, { target: { value: '' } });

    expect(onPick).not.toHaveBeenCalled();
    expect(input).toHaveValue('');
  });

  it('never shows a validity error yet — no inline ceiling check exists at this step (S-191, partial)', () => {
    render(<NewRuleValidityStep decision="allow" expiresAt={null} onPick={() => {}} />);

    expect(screen.queryByRole('alert')).toBeNull();
  });
});
