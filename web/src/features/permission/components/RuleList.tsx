import { LoadedList } from '@/shared/components/LoadedList';
import type { ListKeys } from '@/shared/components/LoadedList';
import { usePermissionRules } from '../hooks/usePermissionRules';
import { RuleRow } from './RuleRow';

/** Named as literals, so the orphan check can see that the catalogue entries are in use. */
const KEYS: ListKeys = {
  title: 'rules.list.title',
  description: 'rules.list.description',
  loading: 'rules.list.loading',
  emptyTitle: 'rules.list.emptyTitle',
  emptyDescription: 'rules.list.emptyDescription',
};

/**
 * What Claude may do on this machine without asking, and the way to take it back.
 *
 * A rule is authorisation granted **in advance**, and one that outlives the session with nowhere
 * to be seen is a door nobody knows is open. This list is where it is seen, and revoking is one
 * click from it (docs/architecture/web/03-ui-system.md#regras--onde-a-autorização-é-retirada).
 *
 * The empty state explains what a rule is: an empty list with no explanation reads as a failure,
 * and here it is the ordinary state of somebody who has never answered "don't ask again".
 *
 * It imports a hook, and nothing else: no service, no `api.ts`.
 */
export function RuleList(): React.JSX.Element {
  const { isLoading, error, rules, revoking, failure, revoke, reload } = usePermissionRules();

  return (
    <LoadedList
      keys={KEYS}
      isLoading={isLoading}
      error={error}
      isEmpty={rules.length === 0}
      onRetry={reload}
    >
      {rules.map(({ rule, expiringSoon }) => (
        <RuleRow
          key={rule.id}
          rule={rule}
          expiringSoon={expiringSoon}
          busy={revoking.has(rule.id)}
          failure={failure?.ruleId === rule.id ? failure.error : null}
          onRevoke={revoke}
        />
      ))}
    </LoadedList>
  );
}
