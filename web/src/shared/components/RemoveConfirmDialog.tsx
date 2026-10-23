import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { DestructiveConfirmFooter } from '@/shared/components/DestructiveConfirmFooter';
import { DialogFrame } from '@/shared/components/DialogFrame';

/** What a removable row is named by, for the title and the list of a batch. */
export interface RemoveConfirmTarget {
  readonly id: string;
  readonly name: string;
}

/**
 * The i18n keys of a remove confirm, translated by {@link RemoveConfirmDialog} itself — a caller
 * declares this as a plain module-level constant (never inline in JSX, see the note on
 * `RemoveConfirmDialog` for why), so each screen's own copy stays its own.
 */
export interface RemoveConfirmKeys {
  /** `{{name}}` — exactly one target. */
  readonly titleOne: string;

  /** `{{count}}` — more than one target. */
  readonly titleMany: string;
  readonly description: string;
  readonly keep: string;
  readonly confirm: string;
  readonly pending: string;
  readonly list: string;
}

export interface RemoveConfirmDialogProps<T extends RemoveConfirmTarget> {
  /** `null` while nothing is asked; one or more rows while the confirm is open. */
  readonly targets: readonly T[] | null;
  readonly pending: boolean;
  readonly keys: RemoveConfirmKeys;
  onCancel(): void;
  onConfirm(): unknown;
}

/**
 * "Remove this?" — destructive, for good, so the way out is the first button and takes the focus on
 * open: an `Enter` pressed out of habit removes nothing (S-135). A batch of more than one lists every
 * target by name.
 *
 * Shared by every screen that removes rows this same way — `mcp`'s own `RemoveServerDialog` and an
 * engine extension's own `RemovePluginDialog` (plan 13, B-28, B-29) — rather than each hand-copying the
 * same focus-on-open, title-for-one-or-many and list-of-names logic. `keys` is a prop and not a set
 * of per-string render props on purpose: `pnpm lint:dup` treats JSX attribute values as
 * interchangeable when comparing two call sites (confirmed by hand — two wizards whose attributes
 * differ only in which translation key each names still read as the same clone), so the keys live in
 * an ordinary object a caller declares once, outside any JSX, where their literal text is what tells
 * two otherwise-identical screens apart instead of being erased by the comparison.
 */
export function RemoveConfirmDialog<T extends RemoveConfirmTarget>({
  targets,
  pending,
  keys,
  onCancel,
  onConfirm,
}: RemoveConfirmDialogProps<T>): React.JSX.Element {
  const { t } = useTranslation();
  const keep = useRef<HTMLButtonElement>(null);
  const open = targets !== null;

  useEffect(() => {
    if (open) {
      keep.current?.focus();
    }
  }, [open]);

  const title =
    targets === null
      ? ''
      : targets.length === 1
        ? t(keys.titleOne, { name: targets[0]?.name ?? '' })
        : t(keys.titleMany, { count: targets.length });

  return (
    <DialogFrame
      open={open}
      onClose={onCancel}
      title={title}
      description={t(keys.description)}
      footer={
        <DestructiveConfirmFooter
          keepRef={keep}
          pending={pending}
          keepLabel={t(keys.keep)}
          confirmLabel={t(keys.confirm)}
          pendingLabel={t(keys.pending)}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      }
    >
      {targets !== null && targets.length > 1 && (
        <ul aria-label={t(keys.list)} className="flex flex-col gap-1 text-ui">
          {targets.map((target) => (
            <li key={target.id}>{target.name}</li>
          ))}
        </ul>
      )}
    </DialogFrame>
  );
}
