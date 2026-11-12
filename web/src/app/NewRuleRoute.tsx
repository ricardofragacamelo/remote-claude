import { useNavigate, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { DEFAULT_RULES_SEARCH, NewRuleWizard, newRuleWizardHelp } from '@/features/permission';
import { ScreenFrame } from '@/shared/components/ScreenFrame';
import { useShellShortcuts } from './screen-shortcuts';
import { useOpenRule } from './useOpenRule';

/**
 * `/rules/new` — the rule-authoring wizard, in a route of its own (D-19): the draft lives in the
 * search, so a hand-off (Recriar, "criar regra a partir desta invocação" once it exists) survives
 * a sign-in the same way `/rules`'s own filters do.
 */
export function NewRuleRoute(): React.JSX.Element {
  const { t } = useTranslation();
  const search = useSearch({ from: '/_frame/rules/new' });
  const navigate = useNavigate();
  const openRule = useOpenRule();
  const shortcuts = useShellShortcuts();

  return (
    <ScreenFrame
      title={t('rules.wizard.screenTitle')}
      purpose={t('rules.wizard.screenPurpose')}
      help="rules.wizardHelp"
      shortcuts={shortcuts}
      extra={newRuleWizardHelp(t)}
    >
      <NewRuleWizard
        initial={search}
        onCancel={() => {
          void navigate({ to: '/rules', search: DEFAULT_RULES_SEARCH });
        }}
        onCreated={(rule) => {
          openRule(rule.id);
        }}
        onOpenRule={openRule}
      />
    </ScreenFrame>
  );
}
