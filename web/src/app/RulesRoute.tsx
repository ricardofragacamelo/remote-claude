import { useCallback } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';

import { RulesScreenFrame } from './RulesScreenFrame';
import { useOpenRule } from './useOpenRule';

/**
 * `/rules` — what the user authorised in advance, and where it is taken back.
 *
 * A route of its own and not a section of a settings page
 * ([D-04](../../../docs/plans/03-rules-and-audit/decisions.md#d-04--onde-a-revogação-mora)): the
 * promise is that revoking is one click away, and inside settings it would be three. The same
 * link works pasted on another device, which is what a route is for — the tabs, the filters and
 * the sort are all in the search (S-156), so a filtered, sorted screen is a link too.
 */
export function RulesRoute(): React.JSX.Element {
  const search = useSearch({ from: '/_frame/rules' });
  const navigate = useNavigate();

  const onSearch = useCallback(
    (next: typeof search) => {
      void navigate({ to: '/rules', search: next });
    },
    [navigate],
  );

  const openRule = useOpenRule();
  const onOpenRule = useCallback(
    (ruleId: string) => {
      openRule(ruleId, search);
    },
    [openRule, search],
  );

  return <RulesScreenFrame search={search} onSearch={onSearch} onOpenRule={onOpenRule} />;
}
