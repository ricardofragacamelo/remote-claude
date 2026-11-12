import type { PermissionDecision, PersistedScope } from '../types/permission';
import type { RuleImportPreview } from '../types/rule';

export interface TemplateRuleRow {
  readonly pattern: string;
  readonly decision: PermissionDecision;
  readonly breadth: 'narrow' | 'broad' | 'unbounded';
}

/** Every date this file's own schema asks for, informative only and ignored on import (D-17) —
 * fixed, never the wall clock. `useRuleImportPreview` keys its own read by this string's content
 * (`useAsyncRead`): built fresh from `new Date()` on every render, the key would never repeat
 * twice, and the read would never settle into `ready` at all. */
const PLACEHOLDER_DATE = '2000-01-01T00:00:00.000Z';

/**
 * The file `/permission-rules/import/preview` and `/permission-rules/import` both read —
 * applying a template is an import, never a path of its own (D-16). The scope, folder and
 * validity are chosen once for the whole batch (S-203); `expiresAt` here is informative only,
 * ignored on import (D-17) — the apply call's own `expiresAt` is what actually counts.
 */
export function templateExportFileOf(args: {
  readonly rules: readonly TemplateRuleRow[];
  readonly scope: PersistedScope;
  readonly folder: string | null;
}): string {
  return JSON.stringify({
    format: 'remote-claude.permission-rules',
    version: 1,
    exportedAt: PLACEHOLDER_DATE,
    rules: args.rules.map((rule) => ({
      pattern: rule.pattern,
      decision: rule.decision,
      scope: args.scope,
      projectPath: args.scope === 'project' ? args.folder : null,
      expiresAt: PLACEHOLDER_DATE,
    })),
  });
}

export type TemplatePreviewItem = RuleImportPreview['items'][number];

/** `unbounded` refused for `allow`, same D-09 the single-rule wizard already enforces — never
 * offered as a choice here, forced out of the batch whatever its own checkbox says. */
export function isTemplateItemBlocked(
  item: Pick<TemplatePreviewItem, 'decision' | 'breadth'>,
): boolean {
  return item.breadth === 'unbounded' && item.decision === 'allow';
}

/** The indices `accept` carries — every included, non-`invalid`, non-blocked item (S-203: nothing
 * is sent before Confirm, and an excluded or invalid item is never part of the lot). */
export function templateAcceptIndices(
  items: readonly TemplatePreviewItem[],
  included: ReadonlySet<number>,
): readonly number[] {
  return items
    .filter(
      (item) =>
        included.has(item.index) && item.verdict !== 'invalid' && !isTemplateItemBlocked(item),
    )
    .map((item) => item.index);
}

/** The indices `acknowledgeBroad` carries — every accepted item whose own breadth is `broad`,
 * only once the batch's single acknowledgement checkbox is checked (D-09). */
export function templateBroadIndices(
  items: readonly TemplatePreviewItem[],
  accepted: readonly number[],
  acknowledgeBroad: boolean,
): readonly number[] {
  if (!acknowledgeBroad) {
    return [];
  }

  const acceptedIds = new Set(accepted);
  return items
    .filter((item) => acceptedIds.has(item.index) && item.breadth === 'broad')
    .map((item) => item.index);
}

/** Whether any accepted item needs the batch's own acknowledgement checkbox at all — nothing to
 * check when none of them are `broad`. */
export function hasAcceptedBroadItem(
  items: readonly TemplatePreviewItem[],
  accepted: readonly number[],
): boolean {
  const acceptedIds = new Set(accepted);
  return items.some((item) => acceptedIds.has(item.index) && item.breadth === 'broad');
}

export interface TemplateBatchState {
  readonly included: ReadonlySet<number>;
  readonly accepted: readonly number[];
  readonly needsAcknowledge: boolean;
  readonly validityDecision: PermissionDecision;
  readonly canConfirm: boolean;
}

/**
 * Every derived bit `TemplateReview`'s own render reads — one place for it, rather than scattered
 * across the component (which a review step reading this would otherwise have to re-derive
 * itself, branch by branch). `preview` is `null` while there is nothing to decide by yet (no
 * folder chosen for a `project`-scoped batch, or the read still in flight) — `canConfirm` stays
 * `false` the whole time, the only thing that matters this early.
 */
export function templateBatchStateOf(args: {
  readonly rules: readonly TemplateRuleRow[];
  readonly excluded: ReadonlySet<number>;
  readonly preview: readonly TemplatePreviewItem[] | null;
  readonly acknowledgeBroad: boolean;
  readonly scopeReady: boolean;
  readonly expiresAt: string | null;
  readonly submitting: boolean;
}): TemplateBatchState {
  const included = new Set(
    args.rules.map((_, index) => index).filter((index) => !args.excluded.has(index)),
  );
  const accepted = args.preview === null ? [] : templateAcceptIndices(args.preview, included);
  const needsAcknowledge =
    args.preview !== null && hasAcceptedBroadItem(args.preview, accepted) && !args.acknowledgeBroad;
  const validityDecision: PermissionDecision = args.rules.some((rule) => rule.decision === 'allow')
    ? 'allow'
    : 'deny';

  return {
    included,
    accepted,
    needsAcknowledge,
    validityDecision,
    canConfirm:
      !args.submitting &&
      args.scopeReady &&
      args.expiresAt !== null &&
      args.preview !== null &&
      accepted.length > 0 &&
      !needsAcknowledge,
  };
}
