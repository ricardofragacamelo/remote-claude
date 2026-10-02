import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { openFile } from '@/features/editor';
import { EditorSettings } from '@/features/editor/components/EditorSettings';
import {
  initialPreferences,
  useEditorPreferences,
} from '@/features/editor/store/preferences.store';
import { FOLDER, editorOf, renderEditor } from '../../../support/editor';
import { fakeDisk } from '../../../support/editor-disk';
import { render, translator } from '../../../support/render';

const t = translator('en');

afterEach(() => {
  vi.restoreAllMocks();
});

function option(legend: string): HTMLElement {
  return screen.getByRole('group', { name: legend });
}

describe('Settings › Editor — plan 07, B-39', () => {
  it('starts at the defaults — auto-save off — and each change takes effect on every open tab (S-257)', async () => {
    const user = userEvent.setup();
    fakeDisk(FOLDER, { 'a.ts': 'a', 'b.ts': 'b' });
    renderEditor();
    render(<EditorSettings />);
    act(() => {
      openFile(FOLDER, 'a.ts');
      openFile(FOLDER, 'b.ts', { toSide: true });
    });
    const a = await editorOf('a.ts');
    const b = await editorOf('b.ts');

    expect(
      within(option(t('editor.settings.autoSave'))).getByRole('radio', {
        name: t('editor.settings.autoSaveOff'),
      }),
    ).toBeChecked();
    expect(a.style.fontSize).toBe('13px');

    await user.click(
      within(option(t('editor.settings.fontSize'))).getByRole('radio', {
        name: t('editor.settings.pixels', { value: 16 }),
      }),
    );
    expect(a.style.fontSize).toBe('16px');
    expect(b.style.fontSize).toBe('16px');

    await user.click(
      within(option(t('editor.settings.zoom'))).getByRole('radio', {
        name: t('editor.settings.percent', { value: 150 }),
      }),
    );
    expect(a.style.fontSize).toBe('24px');

    await user.click(
      within(option(t('editor.settings.wordWrap'))).getByRole('radio', {
        name: t('editor.settings.on'),
      }),
    );
    expect(a.wrap).toBe('soft');
    expect(b.wrap).toBe('soft');

    await user.click(
      within(option(t('editor.settings.font'))).getByRole('radio', {
        name: t('editor.settings.fontBrowser'),
      }),
    );
    expect(a.style.fontFamily).toBe('monospace');

    for (const [legend, choice] of [
      ['editor.settings.tabSize', t('editor.settings.columns', { value: 2 })],
      ['editor.settings.insertSpaces', t('editor.settings.off')],
      ['editor.settings.minimap', t('editor.settings.off')],
      ['editor.settings.autoSave', t('editor.settings.autoSaveOnFocusChange')],
      ['editor.settings.trimTrailingWhitespace', t('editor.settings.on')],
      ['editor.settings.insertFinalNewline', t('editor.settings.on')],
    ] as const) {
      await user.click(within(option(t(legend))).getByRole('radio', { name: choice }));
    }
    expect(useEditorPreferences.getState().preferences).toMatchObject({
      tabSize: 2,
      insertSpaces: false,
      minimap: false,
      autoSave: 'onFocusChange',
      trimTrailingWhitespace: true,
      insertFinalNewline: true,
    });
    expect(a.style.tabSize).toBe('2');

    for (const legend of [
      'editor.settings.font',
      'editor.settings.fontSize',
      'editor.settings.zoom',
      'editor.settings.tabSize',
      'editor.settings.autoSave',
      'editor.settings.wordWrap',
    ]) {
      await user.click(
        within(option(t(legend))).getByRole('button', {
          name: t('settings.option.restoreLabel', { option: t(legend) }),
        }),
      );
    }
    expect(a.style.fontSize).toBe('13px');
    expect(useEditorPreferences.getState().preferences.autoSave).toBe('off');
  });

  it('keeps working with the defaults when the browser keeps nothing (S-258)', async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    fakeDisk(FOLDER, { 'a.ts': 'a' });

    expect(initialPreferences()).toMatchObject({ fontSize: 13, autoSave: 'off' });
    renderEditor();
    render(<EditorSettings />);
    act(() => {
      openFile(FOLDER, 'a.ts');
    });
    const a = await editorOf('a.ts');

    await user.click(
      within(option(t('editor.settings.fontSize'))).getByRole('radio', {
        name: t('editor.settings.pixels', { value: 18 }),
      }),
    );
    expect(a.style.fontSize).toBe('18px');
  });
});
