import { useTranslation } from 'react-i18next';

import { RuleList } from '@/features/permission';
import { Screen, SignedIn } from './Screen';

/**
 * `/rules` — what the user authorised in advance, and where it is taken back.
 *
 * A route of its own and not a section of a settings page
 * ([D-04](../../../docs/plans/03-rules-and-audit/decisions.md#d-04--onde-a-revogação-mora)): the
 * promise is that revoking is one click away, and inside settings it would be three. The same
 * link works pasted on another device, which is what a route is for.
 */
export function RulesRoute(): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <Screen
      title={t('rules.screen.title')}
      links={[
        { to: '/', label: t('rules.screen.back') },
        { to: '/audit', label: t('audit.screen.open') },
      ]}
    >
      <SignedIn returnTo="/rules">
        <RuleList />
      </SignedIn>
    </Screen>
  );
}
