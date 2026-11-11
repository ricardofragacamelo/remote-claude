import { useState } from 'react';

import { useClock } from '@/shared/hooks/useClock';
import { dateInputToExpiresAt, dateInputValueOf } from '../lib/rule-expiry-shortcuts';
import type { PermissionDecision } from '../types/permission';
import { ExpiryPicker } from './ExpiryPicker';

export interface NewRuleValidityStepProps {
  readonly decision: PermissionDecision;
  readonly expiresAt: string | null;
  onPick(expiresAt: string): void;
}

/**
 * Step 5: the same shortcuts and free date `RuleExpiryDialog` already offers (plan 15, B-23),
 * shared as `ExpiryPicker` — counted from now, never from a grant that has not happened yet
 * (D-14). `deny` gets its own fourth, longer shortcut (D-04). A malformed free date says nothing
 * upward yet — `canAdvance` just stays false until one parses.
 */
export function NewRuleValidityStep({
  decision,
  expiresAt,
  onPick,
}: NewRuleValidityStepProps): React.JSX.Element {
  const now = useClock(false);
  const [date, setDate] = useState(() => (expiresAt === null ? '' : dateInputValueOf(expiresAt)));

  return (
    <ExpiryPicker
      date={date}
      decision={decision}
      error={null}
      now={now}
      onPick={(next) => {
        setDate(next);
        const picked = dateInputToExpiresAt(next);
        if (picked !== undefined) {
          onPick(picked);
        }
      }}
    />
  );
}
