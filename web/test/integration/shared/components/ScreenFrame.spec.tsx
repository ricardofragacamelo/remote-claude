import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { helpAnchor } from '@/shared/components/HelpPanel';
import { ScreenFrame } from '@/shared/components/ScreenFrame';
import { Button } from '@/shared/components/ui/button';
import { useHelpPanel } from '@/shared/hooks/useHelpPanel';
import { VISITOR_PREFIX } from '@/shared/lib/visitor-storage';
import { render, translator } from '../../../support/render';
import { aViewport } from '../../../support/viewport';

const t = translator('en');

/** The trail's screen, framed — its help is real, in both languages (S-94). */
function aScreen(shortcuts: readonly { keys: string; description: string }[] = []) {
  return (
    <ScreenFrame
      title={t('audit.screen.title')}
      purpose={t('audit.screen.purpose')}
      help="audit.help"
      shortcuts={shortcuts}
      actions={<Button>{t('common.action.retry')}</Button>}
    >
      <p>{t('audit.list.emptyTitle')}</p>
    </ScreenFrame>
  );
}

function helpButton(): HTMLElement {
  return screen.getByRole('button', { name: t('help.panel.open') });
}

function helpPanel(): HTMLElement | null {
  return screen.queryByRole('complementary', {
    name: t('help.panel.title', { screen: t('audit.screen.title') }),
  });
}

describe('the frame of a screen — plan 06, S-93', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('heads the screen with its title, its purpose in one line and its actions', () => {
    render(aScreen());

    expect(screen.getByRole('heading', { level: 1, name: t('audit.screen.title') })).toBeVisible();
    expect(screen.getByText(t('audit.screen.purpose'))).toBeVisible();
    expect(screen.getByRole('button', { name: t('common.action.retry') })).toBeVisible();
    expect(screen.getByText(t('audit.list.emptyTitle'))).toBeVisible();
    expect(helpButton()).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the help in its four fixed parts, written for the screen', async () => {
    const user = userEvent.setup();
    render(aScreen());

    await user.click(helpButton());

    const panel = helpPanel()!;
    const parts = [
      ['help.section.what', 'audit.help.what'],
      ['help.section.states', 'audit.help.states'],
      ['help.section.notRecorded', 'audit.help.notRecorded'],
    ] as const;
    for (const [heading, text] of parts) {
      const part = within(panel).getByRole('region', { name: t(heading) });
      expect(within(part).getByText(t(text))).toBeVisible();
    }
    expect(
      within(panel).getByRole('region', { name: t('help.section.shortcuts') }),
    ).toHaveTextContent(t('help.shortcuts.none'));
    expect(helpButton()).toHaveAttribute('aria-expanded', 'true');
  });

  it('lists the shortcuts of the screen it is given', async () => {
    const user = userEvent.setup();
    render(aScreen([{ keys: 'Ctrl+O', description: t('workspace.welcome.openFolder') }]));

    await user.click(helpButton());

    const part = within(helpPanel()!).getByRole('region', { name: t('help.section.shortcuts') });
    expect(within(part).getByText('Ctrl+O')).toBeVisible();
    expect(within(part).getByText(t('workspace.welcome.openFolder'))).toBeVisible();
  });

  it('opens at the part a control asked about — a "learn more"', async () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    render(aScreen());

    act(() => {
      useHelpPanel.getState().show('notRecorded');
    });

    const part = await screen.findByRole('region', { name: t('help.section.notRecorded') });
    await waitFor(() => {
      expect(document.activeElement).toBe(part);
    });
    expect(part.id).toBe(helpAnchor('notRecorded'));
    expect(scrolled).toHaveBeenCalled();
    expect(useHelpPanel.getState().section).toBeNull();
  });

  it('has no accessibility violation, with the help open', async () => {
    const user = userEvent.setup();
    const { container } = render(aScreen());

    await user.click(helpButton());

    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('the help, opened and closed — plan 06, S-95', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens once however often it is asked — never two panels', async () => {
    const user = userEvent.setup();
    render(aScreen());

    await user.click(helpButton());
    act(() => {
      useHelpPanel.getState().show();
    });

    expect(screen.getAllByRole('complementary')).toHaveLength(1);
  });

  it('closes from its own button and from the one that opened it', async () => {
    const user = userEvent.setup();
    render(aScreen());

    await user.click(helpButton());
    await user.click(screen.getByRole('button', { name: t('help.panel.close') }));
    expect(helpPanel()).toBeNull();

    await user.click(helpButton());
    await user.click(helpButton());
    expect(helpPanel()).toBeNull();
  });

  it('is remembered by this browser: left open, the next screen opens with it', async () => {
    const user = userEvent.setup();
    const first = render(aScreen());

    await user.click(helpButton());
    expect(localStorage.getItem(`${VISITOR_PREFIX}help.open`)).toBe('true');
    first.unmount();

    render(aScreen());
    expect(helpPanel()).not.toBeNull();
  });

  it('is a sheet from the bottom under md, that Esc closes', async () => {
    aViewport('phone');
    const user = userEvent.setup();
    render(aScreen());

    await user.click(helpButton());

    const sheet = await screen.findByRole('dialog', {
      name: t('help.panel.title', { screen: t('audit.screen.title') }),
    });
    expect(within(sheet).getByText(t('audit.help.what'))).toBeVisible();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(useHelpPanel.getState().open).toBe(false);
  });
});
