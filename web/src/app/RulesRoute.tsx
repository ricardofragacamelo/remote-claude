import { useTranslation } from 'react-i18next';

import { RuleList } from '@/features/permission';
import { ScreenFrame } from '@/shared/components/ScreenFrame';
import { useShellShortcuts } from './screen-shortcuts';

/**
 * `/rules` — what the user authorised in advance, and where it is taken back.
 *
 * A route of its own and not a section of a settings page
 * ([D-04](../../../docs/plans/03-rules-and-audit/decisions.md#d-04--onde-a-revogação-mora)): the
 * promise is that revoking is one click away, and inside settings it would be three. The same
 * link works pasted on another device, which is what a route is for.
 */
export function RulesRoute(): React.JSX.Element {
  const shortcuts = useShellShortcuts();
  const { t } = useTranslation();

  return (
    <ScreenFrame
      title={t('rules.screen.title')}
      purpose={t('rules.screen.purpose')}
      help="rules.help"
      shortcuts={shortcuts}
    >
      <RuleList />
    </ScreenFrame>
  );
}
