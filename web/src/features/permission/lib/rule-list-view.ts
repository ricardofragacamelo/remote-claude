import type { ListStatusProps } from '@/shared/components/ListStatus';
import type { RuleMutationFailure } from '../hooks/useRuleMutations';
import type { PermissionRule } from '../types/rule';

/**
 * What the table and the card list need alike (S-159…S-162, S-168): the rows, the four states, the
 * seven-day warning, the keyboard's own focus, and a mutation already running or just failed —
 * `RuleTableProps` and `RuleCardListProps` each add only what their own view needs on top of this.
 */
export interface RuleListViewProps {
  readonly rules: readonly PermissionRule[];
  readonly isLoading: boolean;
  readonly error: ListStatusProps['error'];
  readonly isEmpty: boolean;
  onRetry(): void;
  readonly emptyTitleKey: string;
  readonly emptyDescriptionKey: string;
  readonly now: number;
  readonly expiringSoon: ReadonlySet<string>;

  /** The rule the keyboard moved to — `null` when the view itself has no focus (S-168). */
  readonly focusedId: string | null;
  onKeyDown(event: React.KeyboardEvent): void;

  readonly inFlight: ReadonlySet<string>;
  readonly failure: RuleMutationFailure | null;
}
