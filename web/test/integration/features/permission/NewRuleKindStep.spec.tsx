import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { NewRuleKindStep } from '@/features/permission/components/NewRuleKindStep';
import { NEW_RULE_KINDS } from '@/features/permission/lib/rule-kind-fields';
import type { NewRuleKind } from '@/features/permission/lib/rule-kind-fields';
import { createI18n } from '@/shared/i18n';
import { kindShortName } from '@/shared/lib/tool-label';
import { render, translator } from '../../../support/render';

const t = translator('en');
const realT = createI18n('en').t;

function labelOf(kind: NewRuleKind): string {
  return kindShortName(kind, realT);
}

describe('step 1 of the rule-authoring wizard, the kind — plan 15, B-27', () => {
  it('lists every canonical kind, most used first, as a radio group', () => {
    render(<NewRuleKindStep kind={null} onPick={() => {}} />);

    const group = screen.getByRole('radiogroup', { name: t('rules.wizard.kindStepLabel') });
    const radios = screen.getAllByRole('radio');

    expect(radios).toHaveLength(NEW_RULE_KINDS.length);
    NEW_RULE_KINDS.forEach((kind) => {
      expect(group).toContainElement(screen.getByRole('radio', { name: labelOf(kind) }));
    });
  });

  it('starts with nothing picked when the draft has no kind yet', () => {
    render(<NewRuleKindStep kind={null} onPick={() => {}} />);

    NEW_RULE_KINDS.forEach((kind) => {
      expect(screen.getByRole('radio', { name: labelOf(kind) })).toHaveAttribute(
        'aria-checked',
        'false',
      );
    });
  });

  it('shows the kind the draft already carries as checked, and only that one', () => {
    render(<NewRuleKindStep kind="file.edit" onPick={() => {}} />);

    expect(screen.getByRole('radio', { name: labelOf('file.edit') })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: labelOf('shell') })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('picks the kind clicked, whichever it is — the first, the last, and one in the middle', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<NewRuleKindStep kind={null} onPick={onPick} />);

    await user.click(screen.getByRole('radio', { name: labelOf('shell') }));
    await user.click(screen.getByRole('radio', { name: labelOf('mcp') }));
    await user.click(screen.getByRole('radio', { name: labelOf('file.move') }));

    expect(onPick).toHaveBeenNthCalledWith(1, 'shell');
    expect(onPick).toHaveBeenNthCalledWith(2, 'mcp');
    expect(onPick).toHaveBeenNthCalledWith(3, 'file.move');
  });
});
