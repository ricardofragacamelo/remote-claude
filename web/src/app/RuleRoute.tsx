import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { RuleDetail } from '@/features/permission';
import { Screen, SignedIn } from './Screen';

/**
 * `/rules/:ruleId` — one rule, whatever became of it.
 *
 * Reached from the trail entry it answered. A revoked rule still opens here, with its state, rather
 * than as an empty page: "which rule let this run?" has an answer after the rule was taken back
 * ([D-18](../../../docs/plans/03-rules-and-audit/decisions.md)).
 */
export function RuleRoute(): React.JSX.Element {
  const { t } = useTranslation();
  const { ruleId } = useParams({ from: '/rules/$ruleId' });

  return (
    <Screen
      title={t('rules.detail.screenTitle')}
      links={[
        { to: '/rules', label: t('rules.screen.open') },
        { to: '/audit', label: t('audit.screen.open') },
      ]}
    >
      <SignedIn returnTo={`/rules/${ruleId}`}>
        <RuleDetail ruleId={ruleId} />
      </SignedIn>
    </Screen>
  );
}
