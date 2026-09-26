import { LoadedList } from '@/shared/components/LoadedList';
import type { ListKeys } from '@/shared/components/LoadedList';
import { usePermissionRule } from '../hooks/usePermissionRule';
import { RuleRow } from './RuleRow';

/** Named as literals, so the orphan check can see that the catalogue entries are in use. */
const KEYS: ListKeys = {
  title: 'rules.detail.title',
  description: 'rules.detail.description',
  loading: 'rules.detail.loading',
  emptyTitle: 'rules.detail.emptyTitle',
  emptyDescription: 'rules.detail.emptyDescription',
};

export interface RuleDetailProps {
  readonly ruleId: string;
}

/**
 * One rule, whatever became of it — reached from the trail entry it answered (D-04, D-18).
 *
 * The row is the list's, so a rule reads the same in both places. An active one can be revoked
 * right here: from the command that surprised somebody to taking back what let it run is one
 * click. A revoked one says when, and offers nothing — there is nothing left to take back.
 */
export function RuleDetail({ ruleId }: RuleDetailProps): React.JSX.Element {
  const { isLoading, error, rule, expiringSoon, isRevoking, failure, revoke, reload } =
    usePermissionRule(ruleId);

  return (
    <LoadedList
      keys={KEYS}
      isLoading={isLoading}
      error={error}
      isEmpty={rule === null}
      onRetry={reload}
    >
      {rule !== null && (
        <RuleRow
          rule={rule}
          expiringSoon={expiringSoon}
          busy={isRevoking}
          failure={failure}
          onRevoke={revoke}
        />
      )}
    </LoadedList>
  );
}
