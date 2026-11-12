import type { PermissionDecision } from '../types/permission';
import type { RuleImportPreview } from '../types/rule';
import { isTemplateItemBlocked } from './template-import';

export type ImportPreviewItem = RuleImportPreview['items'][number];

/**
 * The raw file's own `projectPath`, read back out alongside the preview — the preview response
 * never carries it (no `folderMap` exists yet at preview time, D-17), so the only way to tell
 * "this `project` item's folder is not one of this installation's own" is to read the file a
 * person chose, the same one already sent for preview. `null` for a file the preview itself would
 * already refuse (`parseImportFile`'s own job, never repeated here) — nothing to remap yet either.
 */
export function importedPathsOf(file: string): readonly (string | null)[] | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(file);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null || !('rules' in parsed)) {
    return null;
  }

  const rules: unknown = (parsed as { rules: unknown }).rules;

  if (!Array.isArray(rules)) {
    return null;
  }

  return rules.map((rule: unknown) => {
    if (typeof rule !== 'object' || rule === null || !('projectPath' in rule)) {
      return null;
    }

    const path: unknown = (rule as { projectPath: unknown }).projectPath;
    return typeof path === 'string' ? path : null;
  });
}

/** Whether `path` is one of `roots`, or a subfolder of one (the same reach `project` scope gives
 * a granted rule, D-10) — what tells a row needing `folderMap` apart from one that already is. */
export function isReachableFolder(path: string, roots: readonly { path: string }[]): boolean {
  return roots.some((root) => path === root.path || path.startsWith(`${root.path}/`));
}

export interface ImportRow {
  readonly item: ImportPreviewItem;
  readonly projectPath: string | null;
  readonly needsRemap: boolean;
  readonly blocked: boolean;
}

/** One row per preview item, joined with the file's own path and whether it is already reachable
 * — everything the table itself reads, computed once rather than per cell. */
export function importRowsOf(
  items: readonly ImportPreviewItem[],
  paths: readonly (string | null)[] | null,
  roots: readonly { path: string }[],
  remapped: ReadonlySet<string>,
): readonly ImportRow[] {
  return items.map((item) => {
    const projectPath = paths?.[item.index] ?? null;
    const reachable =
      projectPath === null || isReachableFolder(projectPath, roots) || remapped.has(projectPath);

    return {
      item,
      projectPath,
      needsRemap: item.scope === 'project' && projectPath !== null && !reachable,
      blocked: isTemplateItemBlocked(item),
    };
  });
}

export interface ImportBatchState {
  readonly accepted: readonly number[];
  readonly acknowledgeBroad: readonly number[];
  readonly needsAcknowledge: boolean;
  readonly needsRemap: boolean;
  readonly validityDecision: PermissionDecision;
  readonly canConfirm: boolean;
}

/**
 * Everything the review's own Confirm gate and the apply call itself read, derived once (the same
 * shape `templateBatchStateOf` gives "Modelos", generalized here for per-item acknowledgement and
 * remapping instead of one blanket checkbox — a real uploaded file is not curated the way a
 * catalog template is, so each `broad` item is confirmed on its own, S-206).
 */
export function importBatchStateOf(args: {
  readonly rows: readonly ImportRow[];
  readonly included: ReadonlySet<number>;
  readonly acknowledgedBroad: ReadonlySet<number>;
  readonly expiresAt: string | null;
  readonly submitting: boolean;
}): ImportBatchState {
  const includedRows = args.rows.filter((row) => args.included.has(row.item.index));
  const acceptableRows = includedRows.filter(
    (row) => row.item.verdict !== 'invalid' && !row.blocked && !row.needsRemap,
  );
  const needsRemap = includedRows.some((row) => row.needsRemap);
  const acceptedRows = acceptableRows.filter(
    (row) => row.item.breadth !== 'broad' || args.acknowledgedBroad.has(row.item.index),
  );
  const needsAcknowledge = acceptableRows.some(
    (row) => row.item.breadth === 'broad' && !args.acknowledgedBroad.has(row.item.index),
  );
  const validityDecision: PermissionDecision = args.rows.some(
    (row) => row.item.decision === 'allow',
  )
    ? 'allow'
    : 'deny';

  return {
    accepted: acceptedRows.map((row) => row.item.index),
    acknowledgeBroad: acceptedRows
      .filter((row) => row.item.breadth === 'broad')
      .map((row) => row.item.index),
    needsAcknowledge,
    needsRemap,
    validityDecision,
    canConfirm:
      !args.submitting &&
      !needsRemap &&
      !needsAcknowledge &&
      args.expiresAt !== null &&
      acceptedRows.length > 0,
  };
}
