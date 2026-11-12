import { useCallback } from 'react';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { RuleDetailPanel, readNewRuleSearch } from '@/features/permission';
import type { PermissionRule, RulesSearch } from '@/features/permission';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/shared/components/ui/sheet';
import { useIsDesktop } from '@/shared/hooks/useMediaQuery';
import { RulesScreenFrame } from './RulesScreenFrame';
import { useOpenRule } from './useOpenRule';

/**
 * `/rules/:ruleId` — one rule, whatever became of it, open over the same list it was opened from
 * (S-222): a sibling route of `/rules`, not a screen of its own, so a second click on another row
 * swaps the rule without losing the list's filters, sort or scroll underneath.
 *
 * Reached from a row of `/rules` itself, or from the trail entry the rule answered. A revoked rule
 * still opens here, with its state, rather than as an empty page — "which rule let this run?" has
 * an answer after the rule was taken back
 * ([D-18](../../../docs/plans/03-rules-and-audit/decisions.md)).
 */
export function RuleRoute(): React.JSX.Element {
  const { t } = useTranslation();
  const { ruleId } = useParams({ from: '/_frame/rules/$ruleId' });
  const search = useSearch({ from: '/_frame/rules/$ruleId' });
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const openRule = useOpenRule();

  const onSearch = useCallback(
    (next: RulesSearch) => {
      void navigate({ to: '/rules/$ruleId', params: { ruleId }, search: next });
    },
    [navigate, ruleId],
  );

  const onOpenRule = useCallback(
    (nextRuleId: string) => {
      openRule(nextRuleId, search);
    },
    [openRule, search],
  );

  const onClose = useCallback(() => {
    void navigate({ to: '/rules', search });
  }, [navigate, search]);

  const onShowTrail = useCallback(() => {
    void navigate({ to: '/audit', search: { ruleId } });
  }, [navigate, ruleId]);

  const onDuplicate = useCallback(
    (rule: PermissionRule) => {
      void navigate({
        to: '/rules/new',
        search: readNewRuleSearch({
          pattern: rule.pattern,
          decision: rule.decision,
          scope: rule.scope,
          ...(rule.projectPath === null ? {} : { folder: rule.projectPath }),
        }),
      });
    },
    [navigate],
  );

  const panel = (
    <RuleDetailPanel
      ruleId={ruleId}
      onClose={onClose}
      onOpenRule={onOpenRule}
      onShowTrail={onShowTrail}
      onDuplicate={onDuplicate}
    />
  );

  return (
    <RulesScreenFrame search={search} onSearch={onSearch} onOpenRule={onOpenRule}>
      {isDesktop ? (
        <aside className="w-full max-w-md shrink-0 border-l border-border pl-4">{panel}</aside>
      ) : (
        // `open` is always `true` here, with no `SheetTrigger` of its own: `/rules/$ruleId` IS the
        // open state, so the only thing Radix ever asks through `onOpenChange` is to close it
        // (Escape, an outside click) — never to open what is already open.
        <Sheet open onOpenChange={onClose}>
          <SheetContent side="right">
            <SheetTitle className="sr-only">{t('permission.ruleDetail.title')}</SheetTitle>
            <SheetDescription className="sr-only">
              {t('permission.ruleDetail.label')}
            </SheetDescription>
            {panel}
          </SheetContent>
        </Sheet>
      )}
    </RulesScreenFrame>
  );
}
