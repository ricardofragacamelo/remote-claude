import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { RuleDetail } from '@/features/permission';
import { ScreenFrame } from '@/shared/components/ScreenFrame';
import { useShellShortcuts } from './screen-shortcuts';

/**
 * `/rules/:ruleId` — one rule, whatever became of it.
 *
 * Reached from the trail entry it answered. A revoked rule still opens here, with its state, rather
 * than as an empty page: "which rule let this run?" has an answer after the rule was taken back
 * ([D-18](../../../docs/plans/03-rules-and-audit/decisions.md)).
 */
export function RuleRoute(): React.JSX.Element {
  const shortcuts = useShellShortcuts();
  const { t } = useTranslation();
  const { ruleId } = useParams({ from: '/_frame/rules/$ruleId' });

  return (
    <ScreenFrame
      title={t('rules.detail.screenTitle')}
      purpose={t('rules.detail.purpose')}
      help="rules.detailHelp"
      shortcuts={shortcuts}
    >
      <RuleDetail ruleId={ruleId} />
    </ScreenFrame>
  );
}
