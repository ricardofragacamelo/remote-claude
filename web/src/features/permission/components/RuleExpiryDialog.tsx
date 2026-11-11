import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { useClock } from '@/shared/hooks/useClock';
import { useRuleMutations } from '../hooks/useRuleMutations';
import type { ChangeRuleExpiryResult } from '../hooks/useRuleMutations';
import { dateInputToExpiresAt, dateInputValueOf } from '../lib/rule-expiry-shortcuts';
import { ruleSentence } from '../lib/rule-sentence';
import type { PermissionRule, RuleStatus } from '../types/rule';
import { ExpiryPicker } from './ExpiryPicker';
import { RuleFailureMessage } from './RuleFailureMessage';

/** The word a status reads as in a sentence — the tabs' own words (B-21), never a second set. */
const STATUS_LABEL_KEYS: Readonly<Record<RuleStatus, string>> = {
  active: 'rules.tabs.active',
  expired: 'rules.tabs.expired',
  revoked: 'rules.tabs.revoked',
  // Unreachable from a live `409`: the dialog only opens for an `active` rule, and `disabled` is
  // never a race's real-time target — the migration is the only thing that sets it.
  disabled: 'rules.tabs.revoked',
};

function ruleStatusLabelKey(status: RuleStatus): string {
  return STATUS_LABEL_KEYS[status];
}

/** What undoing a shortening sends — the validity it had right before this write. */
function undoneExpiry(
  changeExpiry: (input: {
    readonly ruleId: string;
    readonly etag: string;
    readonly expiresAt: string;
  }) => Promise<ChangeRuleExpiryResult>,
  changed: ChangeRuleExpiryResult & { readonly outcome: 'changed' },
  previousExpiresAt: string,
  onChanged: (rule: PermissionRule) => void,
): () => void {
  return () => {
    // `changed.rule` just came back from the write that created it — its `etag` is never absent
    // in practice, only optional on the wire type.
    void changeExpiry({
      ruleId: changed.rule.id,
      etag: changed.rule.etag!,
      expiresAt: previousExpiresAt,
    })
      .then((undone) => {
        if (undone.outcome === 'changed') {
          onChanged(undone.rule);
        }
      })
      .catch(() => {});
  };
}

/** What one write of `changeExpiry` leaves behind: the rule's next state, the dialog's, and a toast. */
function handleChangeExpiryResult(
  result: ChangeRuleExpiryResult,
  context: {
    readonly direction: 'shorten' | 'extend';
    readonly previousExpiresAt: string;
    readonly changeExpiry: (input: {
      readonly ruleId: string;
      readonly etag: string;
      readonly expiresAt: string;
    }) => Promise<ChangeRuleExpiryResult>;
    onChanged(rule: PermissionRule): void;
    onOpenChange(open: boolean): void;
    onStale(): void;
    readonly t: TFunction;
  },
): void {
  const { direction, previousExpiresAt, changeExpiry, onChanged, onOpenChange, onStale, t } =
    context;

  onChanged(result.rule);

  if (result.outcome === 'stale') {
    // The dialog stays open, with the fresh rule the next submit etags against —
    // `RuleFailureMessage` says why, inline, never a silent overwrite (S-171).
    onStale();
    return;
  }

  onOpenChange(false);

  if (result.outcome === 'conflict') {
    toast.error(
      t('permission.error.ruleStateConflict', {
        status: t(ruleStatusLabelKey(result.rule.status)),
      }),
    );
    return;
  }

  toast(t(`permission.ruleExpiry.${direction}edToast`), {
    action:
      direction === 'shorten'
        ? {
            label: t('permission.ruleExpiry.undo'),
            onClick: undoneExpiry(changeExpiry, result, previousExpiresAt, onChanged),
          }
        : undefined,
  });
}

export interface RuleExpiryDialogProps {
  readonly rule: PermissionRule;
  readonly direction: 'shorten' | 'extend';
  readonly open: boolean;
  onOpenChange(open: boolean): void;

  /** The rule, fresh — from the write itself, or from the reload a `412`/`409` forces (S-171, S-172). */
  onChanged(rule: PermissionRule): void;
}

/** Why `date`, read against [rule] and [direction], cannot be submitted yet — or `null`. */
function dateError(
  date: string,
  rule: PermissionRule,
  direction: 'shorten' | 'extend',
  now: number,
): { readonly key: string } | null {
  const expiresAt = dateInputToExpiresAt(date);

  if (expiresAt === undefined) {
    return { key: 'permission.ruleExpiry.invalid' };
  }

  const picked = new Date(expiresAt).getTime();
  const current = new Date(rule.expiresAt).getTime();

  if (direction === 'extend' && picked <= current) {
    return { key: 'permission.ruleExpiry.mustBeLater' };
  }

  if (direction === 'shorten' && (picked >= current || picked <= now)) {
    return { key: 'permission.ruleExpiry.mustBeSooner' };
  }

  return null;
}

/**
 * Encurtar applies directly, with "desfazer" in a toast (S-170); estender asks a second step with
 * the sentence restated against the new date, and backing out sends nothing (S-169). Both read the
 * same shortcuts, the same free date, and the same ceiling — only the direction's own validation and
 * the extra step differ.
 */
export function RuleExpiryDialog({
  rule,
  direction,
  open,
  onOpenChange,
  onChanged,
}: RuleExpiryDialogProps): React.JSX.Element {
  const { t, i18n } = useTranslation();
  const [date, setDate] = useState(() => dateInputValueOf(rule.expiresAt));
  const [confirming, setConfirming] = useState(false);
  const [stale, setStale] = useState(false);
  const { changeExpiry, inFlight, failure } = useRuleMutations();
  const now = useClock(false);
  const error = dateError(date, rule, direction, now);
  const busy = inFlight.has(rule.id);

  const onPick = (next: string): void => {
    setDate(next);
    setConfirming(false);
    setStale(false);
  };

  const apply = (): void => {
    const expiresAt = dateInputToExpiresAt(date);

    if (expiresAt === undefined || rule.etag == null) {
      return;
    }

    const previousExpiresAt = rule.expiresAt;

    void changeExpiry({ ruleId: rule.id, etag: rule.etag, expiresAt })
      .then((result) => {
        handleChangeExpiryResult(result, {
          direction,
          previousExpiresAt,
          changeExpiry,
          onChanged,
          onOpenChange,
          onStale: () => {
            setStale(true);
          },
          t,
        });
      })
      // Every outcome this product plans for is a resolved `ChangeRuleExpiryResult` (`changed`,
      // `stale`, `conflict`) — anything else is an unexpected error, already kept in `failure` by
      // `useRuleMutations` itself, and shown by the `RuleFailureMessage` below.
      .catch(() => {});
  };

  const onSubmit = (): void => {
    if (error !== null || busy) {
      return;
    }

    if (direction === 'extend' && !confirming) {
      setConfirming(true);
      return;
    }

    apply();
  };

  const expiresAt = dateInputToExpiresAt(date);
  const previewRule: PermissionRule | null =
    expiresAt === undefined ? null : { ...rule, expiresAt };
  const sentence = previewRule === null ? null : ruleSentence(previewRule, i18n.language, t);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setConfirming(false);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(`permission.ruleExpiry.${direction}Title`)}</DialogTitle>
          <DialogDescription>
            {t('permission.ruleExpiry.ceiling', {
              // Only ever absent on a `disabled` rule, which has no Estender/Encurtar to open this
              // dialog from in the first place.
              at: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
                new Date(rule.expiryCeiling!),
              ),
            })}
          </DialogDescription>
        </DialogHeader>

        {confirming && sentence !== null ? (
          <p className="text-ui-sm">{sentence}</p>
        ) : (
          <ExpiryPicker
            decision={rule.decision}
            date={date}
            error={error}
            now={now}
            onPick={onPick}
          />
        )}

        {stale && <RuleFailureMessage messageKey="permission.error.ruleChanged" params={{}} />}

        {!stale && failure !== null && failure.ruleId === rule.id && (
          <RuleFailureMessage messageKey={failure.error.messageKey} params={failure.error.params} />
        )}

        <ExpiryFooter
          direction={direction}
          confirming={confirming}
          disabled={error !== null || busy}
          onBack={() => {
            setConfirming(false);
          }}
          onCancel={() => {
            onOpenChange(false);
          }}
          onSubmit={onSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}

function ExpiryFooter({
  direction,
  confirming,
  disabled,
  onBack,
  onCancel,
  onSubmit,
}: {
  readonly direction: 'shorten' | 'extend';
  readonly confirming: boolean;
  readonly disabled: boolean;
  onBack(): void;
  onCancel(): void;
  onSubmit(): void;
}): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <DialogFooter>
      <Button variant="outline" onClick={confirming ? onBack : onCancel}>
        {t(confirming ? 'permission.ruleExpiry.back' : 'permission.ruleExpiry.cancel')}
      </Button>
      <Button disabled={disabled} onClick={onSubmit}>
        {t(
          direction === 'extend' && !confirming
            ? 'permission.ruleExpiry.continue'
            : 'permission.ruleExpiry.apply',
        )}
      </Button>
    </DialogFooter>
  );
}
