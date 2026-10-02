import { describe, expect, it } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { openFile } from '@/features/editor';
import { TIMELINE_HELP_PARTS } from '@/features/file-history/components/TimelineHelp';
import { whenOf } from '@/features/file-history/lib/entries';
import { timelineStore } from '@/features/file-history/store/timeline.store';
import en from '@/shared/i18n/locales/en.json';
import ptBR from '@/shared/i18n/locales/pt-BR.json';
import { FOLDER, typeInto } from '../../../support/editor';
import { FakeHistory } from '../../../support/history-api';
import { translator } from '../../../support/render';
import { opened, renderTimeline, timelineToggle, versionsOf } from '../../../support/timeline';

const t = translator('en');

/** A key of a catalogue, as a person reads it. */
function inCatalogue(catalogue: unknown, key: string): string {
  return String(
    key
      .split('.')
      .reduce<unknown>(
        (node, part) => (node as Record<string, unknown> | undefined)?.[part],
        catalogue,
      ),
  );
}

describe('the help of the Timeline — plan 07, B-60, S-351', () => {
  it('says what is kept and what is not, the ceiling and the retention, and that it is not git nor Claude’s undo — in en and pt-BR', () => {
    for (const key of TIMELINE_HELP_PARTS) {
      expect(inCatalogue(en, key)).not.toBe('undefined');
      expect(inCatalogue(ptBR, key)).not.toBe('undefined');
    }

    const english = TIMELINE_HELP_PARTS.map((key) => inCatalogue(en, key)).join(' ');
    expect(english).toMatch(/not git/);
    expect(english).toMatch(/not Claude's undo/);
    expect(english).toMatch(/what Claude writes is not kept here/);
    expect(english).toMatch(/\{\{size\}\}/);
    expect(english).toMatch(/50 versions of each file, 512 MB in all, for 30 days/);

    const portuguese = TIMELINE_HELP_PARTS.map((key) => inCatalogue(ptBR, key)).join(' ');
    expect(portuguese).toMatch(/não é o git/);
    expect(portuguese).toMatch(/não é o desfazer do Claude/);
    expect(portuguese).toMatch(/o que o Claude escreve não é guardado aqui/);
    expect(portuguese).toMatch(/\{\{size\}\}/);
    expect(portuguese).toMatch(/50 versões de cada arquivo, 512 MB no total, por 30 dias/);
  });

  it('opens from its button with the ceiling the installation says, and its shortcuts', async () => {
    const user = userEvent.setup();
    renderTimeline({});

    await user.click(screen.getByRole('button', { name: t('fileHistory.action.help') }));
    const help = await screen.findByRole('dialog', {
      name: t('help.panel.title', { screen: t('fileHistory.screen.title') }),
    });

    await waitFor(() => {
      expect(help).toHaveTextContent(
        t('fileHistory.help.limits', {
          size: t('fileHistory.help.size', { megabytes: '2' }),
        }),
      );
    });
    expect(help).toHaveTextContent(t('fileHistory.help.what'));
    expect(help).toHaveTextContent(t('fileHistory.help.states'));
    expect(within(help).getByText(t('fileHistory.help.limitsHeading'))).toBeVisible();
    expect(help).toHaveTextContent(t('fileHistory.help.notRecorded'));
    expect(within(help).getByText('Ctrl+K H')).toBeVisible();
    expect(within(help).getByText('Ctrl+K D')).toBeVisible();
    expect(within(help).getByText(t('fileHistory.command.showTimeline'))).toBeVisible();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(timelineStore(FOLDER).getState().helpOpen).toBe(false);
  });

  it('reads in Portuguese, with the ceiling it does not know yet said as such', async () => {
    const user = userEvent.setup();
    const pt = translator('pt-BR');
    const history = new FakeHistory();
    history.version('a.ts', 'velho');
    renderTimeline({ 'a.ts': 'agora' }, { history, locale: 'pt-BR', limits: null });
    act(() => {
      timelineStore(FOLDER).getState().setHelpOpen(true);
    });

    const help = await screen.findByRole('dialog', {
      name: pt('help.panel.title', { screen: pt('fileHistory.screen.title') }),
    });
    expect(help).toHaveTextContent(pt('fileHistory.help.notRecorded'));
    expect(help).toHaveTextContent(
      pt('fileHistory.help.limits', { size: pt('fileHistory.help.sizeUnknown') }),
    );
    await user.keyboard('{Escape}');

    act(() => {
      openFile(FOLDER, 'a.ts');
    });
    await screen.findByRole('textbox', { name: pt('editor.view.label', { name: 'a.ts' }) });
    await user.click(screen.getByRole('button', { name: pt('fileHistory.timeline.title') }));
    const list = await screen.findByRole('list', {
      name: pt('fileHistory.timeline.listLabel', { path: 'a.ts' }),
    });
    const [row] = within(list).getAllByRole('listitem');
    expect(row).toHaveTextContent(pt('fileHistory.reason.save'));
    expect(row).toHaveTextContent(pt('fileHistory.author.self'));
  });
});

describe('the Timeline from the keyboard and the palette — plan 07, S-352', () => {
  it('opens and lists from the palette’s shortcuts, the Explorer put on screen first', async () => {
    const user = userEvent.setup();
    const { reveal } = renderTimeline({});
    act(() => {
      document.body.focus();
    });

    await user.keyboard('{Control>}k{/Control}h');
    expect(reveal).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(timelineToggle()).toHaveFocus();
    });
    expect(timelineToggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('tab', { name: t('fileHistory.timeline.thisFile') })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await user.keyboard('{Control>}k{/Control}d');
    expect(reveal).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole('tab', { name: t('fileHistory.timeline.recentlyDeleted') }),
    ).toHaveAttribute('aria-selected', 'true');
  });

  it('puts its commands in the palette, with their shortcuts', async () => {
    const user = userEvent.setup();
    const { reveal } = renderTimeline({});
    act(() => {
      document.body.focus();
    });

    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
    await user.type(
      await screen.findByRole('combobox'),
      t('fileHistory.command.showRecentlyDeleted'),
    );
    expect(
      await screen.findByRole('option', {
        name: new RegExp(t('fileHistory.command.showRecentlyDeleted')),
      }),
    ).toHaveTextContent('Ctrl+K D');
    await user.keyboard('{Escape}');

    await user.keyboard('{Control>}{Shift>}p{/Shift}{/Control}');
    await user.type(await screen.findByRole('combobox'), t('fileHistory.command.help'));
    await user.click(
      await screen.findByRole('option', { name: new RegExp(t('fileHistory.command.help')) }),
    );
    expect(
      await screen.findByRole('dialog', {
        name: t('help.panel.title', { screen: t('fileHistory.screen.title') }),
      }),
    ).toBeVisible();
    expect(reveal).toHaveBeenCalled();
  });

  it('is worked with the keyboard alone: the toggle, the tabs, a version’s actions', async () => {
    const user = userEvent.setup();
    const history = new FakeHistory();
    const old = history.version('a.ts', 'old');
    renderTimeline({ 'a.ts': 'now' }, { history });
    await opened('a.ts');

    act(() => {
      timelineToggle().focus();
    });
    await user.keyboard('{Enter}');
    await versionsOf('a.ts');
    await user.tab();
    await user.tab();
    expect(screen.getByRole('tab', { name: t('fileHistory.timeline.thisFile') })).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(
      screen.getByRole('tab', { name: t('fileHistory.timeline.recentlyDeleted') }),
    ).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    await waitFor(async () => {
      expect(await versionsOf('a.ts')).toHaveLength(1);
    });

    const restore = screen.getByRole('button', {
      name: t('fileHistory.action.restore', { when: whenOf(old.at, 'en') }),
    });
    act(() => {
      restore.focus();
    });
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(history.callsOf('POST')).toHaveLength(1);
    });
  });
});

describe('the Timeline has no accessibility violation — plan 07, S-352', () => {
  it('with versions listed, a version picked and a refusal said', async () => {
    const user = userEvent.setup();
    const history = new FakeHistory();
    const old = history.version('a.ts', 'old');
    history.version('a.ts', 'too big', { kept: 'tooLarge' });
    const { disk } = renderTimeline({ 'a.ts': 'now' }, { history });
    await opened('a.ts');
    await user.click(timelineToggle());
    await versionsOf('a.ts');
    await user.click(
      screen.getByRole('button', {
        name: t('fileHistory.action.selectForCompare', { when: whenOf(old.at, 'en') }),
      }),
    );
    disk.write('a.ts', 'changed');
    await user.click(
      screen.getByRole('button', {
        name: t('fileHistory.action.restore', { when: whenOf(old.at, 'en') }),
      }),
    );
    await screen.findByRole('alert');

    expect(await axe(document.body)).toHaveNoViolations();
  });

  it('with the restore question open, and with recently deleted listed', async () => {
    const user = userEvent.setup();
    const history = new FakeHistory();
    const old = history.version('a.ts', 'old');
    history.version('gone.ts', 'gone', { reason: 'delete' });
    renderTimeline({ 'a.ts': 'now' }, { history });
    typeInto(await opened('a.ts'), 'unsaved');
    await user.click(timelineToggle());
    await versionsOf('a.ts');
    await user.click(
      screen.getByRole('button', {
        name: t('fileHistory.action.restore', { when: whenOf(old.at, 'en') }),
      }),
    );
    await screen.findByRole('dialog');

    expect(await axe(document.body)).toHaveNoViolations();

    await user.click(screen.getByRole('button', { name: t('fileHistory.restore.cancel') }));
    await user.click(screen.getByRole('tab', { name: t('fileHistory.timeline.recentlyDeleted') }));
    await screen.findByRole('list', { name: t('fileHistory.deleted.listLabel') });

    expect(await axe(document.body)).toHaveNoViolations();
  });
});
