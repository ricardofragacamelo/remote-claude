import { Bot, Wrench } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SectionSelector } from '@/shared/components/SectionSelector';
import type { SectionTabEntry } from '@/shared/components/SectionTabs';
import { render } from '../../../support/render';

interface FakeSection extends SectionTabEntry {
  readonly title: string;
}

const ONE: FakeSection = { id: 'one', icon: Bot, title: 'One' };
const TWO: FakeSection = { id: 'two', icon: Wrench, title: 'Two' };

const pick = (activeLabel: string): string => `Section: ${activeLabel}`;
const label = (entry: FakeSection): string => entry.title;

/**
 * The phone selector, on its own — plan 13, B-45, S-195.
 *
 * {@link SectionSelector} is generic over whichever registry a screen hands it (the agent's own,
 * plan 13; the app's Settings, plan 06), so this tests it directly, with a registry of its own —
 * including the one state a mounted screen never reaches, `active: undefined` (every registry this
 * product ships always has at least one entry, the same reasoning D-116 already gives
 * `sectionHelpExtras`'s own `?? []`), cheaper here than contriving an empty registry through a whole
 * screen.
 */
describe('the phone selector of a screen’s sections', () => {
  it('names nothing active when nothing is, and still opens its menu', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <SectionSelector
        entries={[ONE, TWO]}
        active={undefined}
        pickLabel={pick}
        label={label}
        onSelect={onSelect}
      />,
    );

    const trigger = screen.getByRole('button', { name: pick('').trim() });
    expect(trigger).toBeVisible();

    await user.click(trigger);
    expect(await screen.findByRole('menuitemradio', { name: 'One' })).toBeVisible();
    expect(screen.getByRole('menuitemradio', { name: 'Two' })).toBeVisible();
  });

  it('names the active entry, with its own icon, and picks another by its id', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <SectionSelector
        entries={[ONE, TWO]}
        active={ONE}
        pickLabel={pick}
        label={label}
        onSelect={onSelect}
      />,
    );

    const trigger = screen.getByRole('button', { name: pick('One') });
    await user.click(trigger);

    const chosen = await screen.findByRole('menuitemradio', { name: 'One' });
    expect(chosen).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByRole('menuitemradio', { name: 'Two' }));
    expect(onSelect).toHaveBeenCalledWith('two');
  });
});
