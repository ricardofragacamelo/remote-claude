import { useTranslation } from 'react-i18next';

import { authorOf, whenOf } from '../lib/entries';
import type { HistoryEntry } from '../types/history';

/** Who wrote a version and when, as a row of the Timeline says them — translated. */
export function useEntryWords(entry: HistoryEntry): {
  readonly who: string;
  readonly when: string;
} {
  const { t, i18n } = useTranslation();
  const author = authorOf(entry.author);

  return { who: t(author.key, author.params), when: whenOf(entry.at, i18n.language) };
}
