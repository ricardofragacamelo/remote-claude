import type { TFunction } from 'i18next';

import { ENCODINGS, LANGUAGES, PLAIN_TEXT, canonicalEncoding } from '../lib/languages';
import { usePalette } from '@/features/commands';
import { editorStoreOf } from '../store/editor.store';
import { useEditorChoice } from '../store/choice.store';
import type { ChoiceOption } from '../store/choice.store';
import type { LineEnding } from '../types/code-editor';
import {
  changeEol,
  changeIndentation,
  changeLanguage,
  reopenWithEncoding,
  saveWithEncoding,
} from './text-actions';

/**
 * The choices of the status bar items, and of the same commands in the palette (B-37) — one list
 * each, so the two never offer different things.
 */

/** The palette's mode for a choice of the editor — entered by name, with no prefix. */
export const CHOICE_MODE = 'editorChoice';

/** Puts a choice in the palette — the same one the status bar item opens (B-37). */
export function offerChoice(titleKey: string, options: readonly ChoiceOption[]): void {
  useEditorChoice.getState().offer(titleKey, options);
  usePalette.getState().show(CHOICE_MODE);
}

const EOLS: readonly LineEnding[] = ['lf', 'crlf'];

/** The options of a named list, the one in use marked, each running `pick` with its id. */
function named(
  names: Readonly<Record<string, string>>,
  current: string | undefined,
  pick: (id: string) => void,
): readonly ChoiceOption[] {
  return Object.entries(names).map(([id, label]) => ({
    id,
    label,
    current: current === id,
    run: () => {
      pick(id);
    },
  }));
}

/** How a line ending is written on screen — its usual name, the same in every language. */
export const EOL_NAMES: Readonly<Record<LineEnding, string>> = { lf: 'LF', crlf: 'CRLF' };

function docOf(folder: string, path: string) {
  return editorStoreOf(folder).getState().docs[path];
}

/** LF or CRLF — converting dirties the tab (S-248). */
export function eolChoices(folder: string, path: string): readonly ChoiceOption[] {
  const current = docOf(folder, path)?.model?.eol();

  return EOLS.map((eol) => ({
    id: eol,
    label: EOL_NAMES[eol],
    current: current === eol,
    run: () => {
      changeEol(folder, path, eol);
    },
  }));
}

/** The language a file is highlighted as (S-251). */
export function languageChoices(
  folder: string,
  path: string,
  t: TFunction,
): readonly ChoiceOption[] {
  const current = docOf(folder, path)?.language;
  const names: Readonly<Record<string, string>> = {
    [PLAIN_TEXT]: t('editor.language.plaintext'),
    ...LANGUAGES,
  };

  return named(names, current, (id) => {
    changeLanguage(folder, path, id);
  });
}

/** "Reopen with encoding" or "Save with encoding" — the encodings the backend converts (S-249). */
export function encodingChoices(
  folder: string,
  path: string,
  mode: 'reopen' | 'save',
): readonly ChoiceOption[] {
  const current = canonicalEncoding(docOf(folder, path)?.encoding ?? 'utf8');

  return named(ENCODINGS, current, (id) => {
    void (mode === 'reopen'
      ? reopenWithEncoding(folder, path, id)
      : saveWithEncoding(folder, path, id));
  });
}

/** Convert the indentation to spaces, or to tabs (S-251). */
export function indentationChoices(
  folder: string,
  path: string,
  t: TFunction,
): readonly ChoiceOption[] {
  const spaces = docOf(folder, path)?.indentation?.insertSpaces;

  return [
    {
      id: 'spaces',
      label: t('editor.indentation.toSpaces'),
      current: spaces === true,
      run: () => {
        changeIndentation(folder, path, true);
      },
    },
    {
      id: 'tabs',
      label: t('editor.indentation.toTabs'),
      current: spaces === false,
      run: () => {
        changeIndentation(folder, path, false);
      },
    },
  ];
}
