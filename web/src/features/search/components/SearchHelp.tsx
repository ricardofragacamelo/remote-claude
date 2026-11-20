import { useTranslation } from 'react-i18next';

import { useScreenHelpBasics } from '@/features/commands';
import { HelpSheet } from '@/shared/components/HelpSheet';
import type { SearchView } from '../hooks/useSearchView';

/** The shortcuts the help lists — read from the registry, never written twice (web/03). */
const HELP_SHORTCUTS = [
  'search.quickOpen',
  'search.openSearch',
  'search.openReplace',
  'search.nextResult',
  'search.previousResult',
] as const;

/**
 * The help of the Search view, written for somebody who has never seen the product (S-142): what
 * it searches, what each toggle and filter does (with an example of regex, of glob, and of
 * "preserve case"), why a result can be missing, what "replace" does **not** do, and its
 * shortcuts. A sheet of its own, opened by its button; `Shift+F1` stays the workbench's.
 */
export function SearchHelp({ view }: { readonly view: SearchView }): React.JSX.Element {
  const { t } = useTranslation();
  const { title, purpose, shortcuts } = useScreenHelpBasics(
    'search.screen.title',
    'search.screen.purpose',
    HELP_SHORTCUTS,
  );

  return (
    <HelpSheet
      title={title}
      purpose={purpose}
      help="search.help"
      shortcuts={shortcuts}
      own={{ open: view.helpOpen, onOpenChange: view.setHelpOpen }}
      extra={[
        {
          id: 'toolbar',
          heading: t('search.help.toolbarHeading'),
          body: t('search.help.toolbar'),
        },
        {
          id: 'missing',
          heading: t('search.help.missingHeading'),
          body: t('search.help.missing'),
        },
        {
          id: 'replace',
          heading: t('search.help.replaceHeading'),
          body: t('search.help.replace'),
        },
      ]}
    />
  );
}
