import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import {
  dateInputValueOf,
  expiryFromShortcut,
  expiryShortcutsFor,
} from '../lib/rule-expiry-shortcuts';
import type { PermissionDecision } from '../types/permission';

export interface ExpiryPickerProps {
  readonly date: string;
  readonly decision: PermissionDecision;
  readonly error: { readonly key: string } | null;
  readonly now: number;
  onPick(next: string): void;
}

/**
 * The shortcuts and the free date every place that picks a rule's own validity offers — the
 * extend/shorten dialog (plan 15, B-23) and the rule-authoring wizard's own validity step (B-27) —
 * counted from now, never from a grant that has not happened yet (D-14). `deny` gets a fourth,
 * longer shortcut (D-04).
 */
export function ExpiryPicker({
  date,
  decision,
  error,
  now,
  onPick,
}: ExpiryPickerProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label={t('permission.ruleExpiry.shortcuts')}
      >
        {expiryShortcutsFor(decision).map((shortcut) => (
          <Button
            key={shortcut.days}
            type="button"
            variant="outline"
            size="touch"
            onClick={() => {
              onPick(
                dateInputValueOf(expiryFromShortcut(shortcut.days, new Date(now)).toISOString()),
              );
            }}
          >
            {t(shortcut.labelKey)}
          </Button>
        ))}
      </div>

      <label className="flex flex-col gap-1 text-xs">
        {t('permission.ruleExpiry.freeDate')}
        <input
          type="date"
          className="h-10 rounded-md border border-border bg-transparent px-3 text-sm"
          value={date}
          onChange={(event) => {
            onPick(event.target.value);
          }}
        />
      </label>

      {error !== null && (
        <p className="text-ui-xs text-destructive" role="alert">
          {t(error.key)}
        </p>
      )}
    </div>
  );
}
