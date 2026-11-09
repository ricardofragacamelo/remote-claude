import { useCallback } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { RulesScreen } from '@/features/permission';
import type { RulesSearch } from '@/features/permission';
import { ScreenFrame } from '@/shared/components/ScreenFrame';
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
 * The rule-authoring wizard `onRecreate` would open is plan 15's B-27, a task that does not exist
 * yet — the callback is wired and ready for it (S-225 asks that Recriar open the wizard, never the
 * pattern), but there is nowhere to navigate to until that route is registered. Filling this in is
 * B-27's own hand-off, not a gap in B-21/B-22 to work around with a route that is not real yet.
 */
export function RulesScreenFrame({
  search,
  onSearch,
  onOpenRule,
  children,
}: RulesScreenFrameProps): React.JSX.Element {
  const shortcuts = useShellShortcuts();
  const { t } = useTranslation();
  const onRecreate = useCallback((): void => undefined, []);

  return (
    <ScreenFrame
      title={t('rules.screen.title')}
      purpose={t('rules.screen.purpose')}
      help="rules.help"
      shortcuts={shortcuts}
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
