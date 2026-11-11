import { useCallback } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { FlaskConical, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useCommands } from '@/features/commands';
import {
  RulesScreen,
  readNewRuleSearch,
  rulesHelpExtras,
  rulesScreenHelp,
} from '@/features/permission';
import type { RulesSearch } from '@/features/permission';
import { Button } from '@/shared/components/ui/button';
import { ScreenFrame } from '@/shared/components/ScreenFrame';
import { useRegistry } from '@/shared/hooks/useRegistry';
import { useShellShortcuts } from './screen-shortcuts';

export interface RulesScreenFrameProps {
  readonly search: RulesSearch;
  onSearch(next: RulesSearch): void;
  onOpenRule(ruleId: string): void;

  /** The rule opened over the list, on `/rules/$ruleId` — absent on the bare `/rules` (S-222). */
  readonly children?: ReactNode;
}

/**
 * The screen frame of `/rules` and `/rules/$ruleId` alike: the same title, help and list, whether
 * or not a rule is open over it — one shell, so the two routes cannot say it two different ways
 * (plan 15, B-21, B-22).
 *
 * Recriar and the screen's own "New rule" button both hand off to `/rules/new` (B-27) the same
 * way: `readNewRuleSearch` turns Recriar's loosely-typed `{decision, scope, folder}` into the
 * wizard's own draft shape, discarding anything that does not fit it, never the pattern (S-225) —
 * the untranslatable one is the engine's own grammar, not the canonical one the wizard writes.
 */
export function RulesScreenFrame({
  search,
  onSearch,
  onOpenRule,
  children,
}: RulesScreenFrameProps): React.JSX.Element {
  const shortcuts = useShellShortcuts(['rules.revokeSelected', 'rules.openExpiringSoon']);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const engineExtras = useRegistry(rulesHelpExtras);

  const onNewRule = useCallback(() => {
    void navigate({ to: '/rules/new', search: {} });
  }, [navigate]);

  const onTestCommand = useCallback(() => {
    void navigate({ to: '/rules/test' });
  }, [navigate]);

  const onRecreate = useCallback(
    (rule: {
      readonly decision: string;
      readonly scope: string;
      readonly folder: string | null;
    }) => {
      void navigate({
        to: '/rules/new',
        search: readNewRuleSearch({
          decision: rule.decision,
          scope: rule.scope,
          ...(rule.folder === null ? {} : { folder: rule.folder }),
        }),
      });
    },
    [navigate],
  );

  useCommands([
    {
      id: 'rules.new',
      labelKey: 'rules.command.new',
      category: 'file',
      icon: Plus,
      run: onNewRule,
    },
    {
      id: 'rules.test',
      labelKey: 'rules.command.test',
      category: 'file',
      icon: FlaskConical,
      run: onTestCommand,
    },
  ]);

  return (
    <ScreenFrame
      title={t('rules.screen.title')}
      purpose={t('rules.screen.purpose')}
      help="rules.help"
      shortcuts={shortcuts}
      extra={rulesScreenHelp(t, engineExtras)}
      actions={
        <>
          <Button type="button" variant="outline" onClick={onTestCommand}>
            <FlaskConical className="size-4" aria-hidden />
            {t('rules.test.button')}
          </Button>
          <Button type="button" onClick={onNewRule}>
            <Plus className="size-4" aria-hidden />
            {t('rules.wizard.newRule')}
          </Button>
        </>
      }
    >
      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          <RulesScreen
            search={search}
            onSearch={onSearch}
            onOpenRule={onOpenRule}
            onRecreate={onRecreate}
          />
        </div>

        {children}
      </div>
    </ScreenFrame>
  );
}
