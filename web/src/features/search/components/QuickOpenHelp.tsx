import { useTranslation } from 'react-i18next';

import { useScreenHelpBasics } from '@/features/commands';
import { HelpSheet } from '@/shared/components/HelpSheet';

const HELP_SHORTCUTS = ['search.quickOpen'] as const;

export interface QuickOpenHelpProps {
  readonly open: boolean;
  onOpenChange(open: boolean): void;
}

/**
 * The help of Quick Open, written for somebody who has never seen the product (S-142): what it
 * finds a file by, what the four states mean, and the right/`Ctrl·Cmd+Enter` shortcuts the result
 * list already has. A sheet of its own, with no state kept across a reload — Quick Open itself
 * never survives one either.
 */
export function QuickOpenHelp({ open, onOpenChange }: QuickOpenHelpProps): React.JSX.Element {
  const { t } = useTranslation();
  const { title, purpose, shortcuts } = useScreenHelpBasics(
    'search.quickOpen.screenTitle',
    'search.quickOpen.screenPurpose',
    HELP_SHORTCUTS,
  );

  return (
    <HelpSheet
      title={title}
      purpose={purpose}
      help="search.quickOpenHelp"
      shortcuts={shortcuts}
      own={{ open, onOpenChange }}
      extra={[
        {
          id: 'openSide',
          heading: t('search.quickOpenHelp.openSideHeading'),
          body: t('search.quickOpenHelp.openSide'),
        },
      ]}
    />
  );
}
