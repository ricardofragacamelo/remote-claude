import { useTranslation } from 'react-i18next';

import { CommandTestPanel } from '@/features/permission';
import { ScreenFrame } from '@/shared/components/ScreenFrame';
import { useShellShortcuts } from './screen-shortcuts';
import { useOpenRule } from './useOpenRule';

/**
 * `/rules/test` — "Testar um comando" on its own (plan 15, B-28): the rules screen's header
 * action and palette command both hand off here, nothing of a draft to carry (unlike `/rules/new`,
 * the panel's own fields start empty every time).
 */
export function TestCommandRoute(): React.JSX.Element {
  const { t } = useTranslation();
  const openRule = useOpenRule();
  const shortcuts = useShellShortcuts();

  return (
    <ScreenFrame
      title={t('rules.test.heading')}
      purpose={t('rules.test.purpose')}
      help="rules.help"
      shortcuts={shortcuts}
    >
      <CommandTestPanel onOpenRule={openRule} />
    </ScreenFrame>
  );
}
