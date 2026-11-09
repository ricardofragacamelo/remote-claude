import { createHash } from 'node:crypto';

import {
  PermissionRule,
  PermissionRuleImportTooLargeError,
  PermissionRuleImportUnsupportedError,
} from '@domain/permission';
import type {
  PermissionDecision,
  PermissionRuleBreadth,
  PermissionRuleScope,
  PersistedPermissionScope,
} from '@domain/permission';
import { DomainError } from '@domain/shared';
import type { UserId } from '@domain/auth';

/** `remote-claude.permission-rules`, version 1 (plan 15, D-17) — the only format this build reads. */
export const RULE_EXPORT_FORMAT = 'remote-claude.permission-rules';
export const RULE_EXPORT_VERSION = 1;

/** The two ceilings of an import file, checked before a single byte of it is parsed as a rule. */
export const MAX_IMPORT_RULES = 500;
export const MAX_IMPORT_BYTES = 256 * 1024;

/** One rule, as the file carries it — no `id`, no `userId`, no origin (S-139). */
export interface RuleExportItem {
  /** Absent for a canonical rule — present only when the rule is restricted to one engine. */
  readonly engine?: string;
  readonly pattern: string;
  readonly decision: PermissionDecision;
  readonly scope: PersistedPermissionScope;
  readonly projectPath: string | null;
  /** Informative only — ignored on import (D-17): the lot gets the default or the chosen ceiling. */
  readonly expiresAt: string;
}

export interface RuleExportFile {
  readonly format: typeof RULE_EXPORT_FORMAT;
  readonly version: typeof RULE_EXPORT_VERSION;
  readonly exportedAt: string;
  readonly rules: readonly RuleExportItem[];
}

/** The file, parsed but with its items still raw — each one is validated on its own (S-138, S-142). */
export interface ParsedImportFile {
  readonly digest: string;
  readonly items: readonly Readonly<Record<string, unknown>>[];
}

/** `GET /permission-rules/export` — one rule, in the file's own shape ([15 · B-18]). */
export function exportItemOf(rule: PermissionRule): RuleExportItem {
  return {
    ...(rule.engine === null ? {} : { engine: rule.engine }),
    pattern: rule.ruleContent,
    decision: rule.decision,
    scope: rule.scope as PersistedPermissionScope,
    projectPath: rule.projectPath,
    expiresAt: rule.expiresAt.toISOString(),
  };
}

/**
 * The digest an import's apply is checked against — of the file's own bytes, not a normalised
 * form: this is anti-tampering between the preview and the apply call, not a content identity
 * (S-143).
 */
export function digestOfImportFile(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/**
 * Reads the envelope — `format`, `version`, size, and that `rules` is a list no longer than the
 * ceiling — and hands back its items **unvalidated**: each one is checked on its own, because one
 * bad item is not the whole file's problem (S-138).
 *
 * @throws {PermissionRuleImportTooLargeError} over 256 KB, or over 500 items
 * @throws {PermissionRuleImportUnsupportedError} not JSON, not an object, or not this format/version
 */
export function parseImportFile(raw: string): ParsedImportFile {
  if (Buffer.byteLength(raw, 'utf8') > MAX_IMPORT_BYTES) {
    throw new PermissionRuleImportTooLargeError('bytes', MAX_IMPORT_BYTES);
  }

  const parsed = parsedJson(raw);

  if (parsed['format'] !== RULE_EXPORT_FORMAT) {
    throw new PermissionRuleImportUnsupportedError('format');
  }

  if (parsed['version'] !== RULE_EXPORT_VERSION) {
    throw new PermissionRuleImportUnsupportedError('version');
  }

  const rules = parsed['rules'];

  if (!Array.isArray(rules)) {
    throw new PermissionRuleImportUnsupportedError('malformed');
  }

  if (rules.length > MAX_IMPORT_RULES) {
    throw new PermissionRuleImportTooLargeError('rules', MAX_IMPORT_RULES);
  }

  return { digest: digestOfImportFile(raw), items: rules.map(recordOf) };
}

function parsedJson(raw: string): Record<string, unknown> {
  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    throw new PermissionRuleImportUnsupportedError('malformed');
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new PermissionRuleImportUnsupportedError('malformed');
  }

  return value as Record<string, unknown>;
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/** What one item of the file is, once read against this installation's own rules. */
export type ImportItemVerdict =
  | { readonly kind: 'new'; readonly breadth: PermissionRuleBreadth }
  | { readonly kind: 'existing'; readonly breadth: PermissionRuleBreadth }
  | { readonly kind: 'invalid'; readonly code: string };

/** The default and the ceiling, in ms, a lot applies per `decision` — `[default, max]`. */
export type ImportLifetimes = Readonly<Record<PermissionDecision, readonly [number, number]>>;

/**
 * One item's verdict, read the same way the grant routine itself would — pattern, decision, scope
 * and (structurally) the project path, with the file's own `expiresAt` ignored and the
 * default/ceiling of `decision` used instead, exactly what applying would grant (D-17).
 *
 * The project path of a `project` item is **not** resolved against the allowlist here — there is
 * no `folderMap` yet at preview time (D-17); that happens only on apply, against the path the
 * caller maps it to. A `project` item's "existing" match is therefore by pattern, decision, engine
 * and scope alone, ignoring the unmapped path — an approximation apply's own equivalence check
 * (the grant routine's advisory lock) makes exact.
 *
 * @param item one raw item of {@link ParsedImportFile.items}
 * @param existing the caller's own active rules, already read
 * @param now preview time — items are compared against the lot's default lifetime, per `decision`
 */
export function verdictOfImportItem(
  item: Readonly<Record<string, unknown>>,
  existing: readonly PermissionRule[],
  userId: UserId,
  now: Date,
  lifetimes: ImportLifetimes,
): ImportItemVerdict {
  try {
    const fields = structuralFieldsOf(item);
    const [defaultMs, maxMs] = lifetimes[fields.decision];
    const draft = PermissionRule.create(
      {
        id: '',
        userId,
        sessionId: null,
        projectPath: fields.scope === 'project' ? fields.projectPath : null,
        pattern: fields.pattern,
        engine: fields.engine,
        decision: fields.decision,
        scope: fields.scope,
        createdAt: now,
        expiresAt: new Date(now.getTime() + defaultMs),
      },
      maxMs,
    );

    if (fields.decision === 'allow' && draft.breadth === 'unbounded') {
      return { kind: 'invalid', code: 'PERMISSION_RULE_TOO_BROAD' };
    }

    return isExisting(draft, existing)
      ? { kind: 'existing', breadth: draft.breadth as PermissionRuleBreadth }
      : { kind: 'new', breadth: draft.breadth as PermissionRuleBreadth };
  } catch (error) {
    return { kind: 'invalid', code: error instanceof DomainError ? error.code : 'INVALID_INPUT' };
  }
}

function isExisting(draft: PermissionRule, existing: readonly PermissionRule[]): boolean {
  // A `project` item's path is unmapped at preview time (no `folderMap` yet, D-17) — matched by
  // pattern/decision/engine/scope alone; apply's own `grant()` makes the match exact once the
  // path is real.
  return existing.some(
    (rule) =>
      rule.scope === draft.scope &&
      rule.engine === draft.engine &&
      rule.decision === draft.decision &&
      rule.ruleContent === draft.ruleContent,
  );
}

export interface StructuralFields {
  readonly pattern: string;
  readonly decision: PermissionDecision;
  readonly scope: Extract<PermissionRuleScope, 'project' | 'always'>;
  readonly projectPath: string | null;
  readonly engine: string | null;
}

/**
 * The fields a rule needs, read off a raw item strictly enough that a wrong type never reaches
 * {@link PermissionRule.create} as something else — `scope: 'maybe'` is invalid, never silently
 * `'always'`. Throws a plain `Error`, never a {@link DomainError}: both {@link verdictOfImportItem}
 * and the apply use case's revalidation pass turn anything that is not one into the generic
 * `INVALID_INPUT`, which is all a malshaped field of an untrusted file ever is.
 */
export function structuralFieldsOf(item: Readonly<Record<string, unknown>>): StructuralFields {
  const pattern = patternFieldOf(item);
  const decision = decisionFieldOf(item);
  const scope = scopeFieldOf(item);
  const engine = engineFieldOf(item);

  return {
    pattern,
    decision,
    scope,
    projectPath: scope === 'project' ? projectPathFieldOf(item) : null,
    engine,
  };
}

function patternFieldOf(item: Readonly<Record<string, unknown>>): string {
  const pattern = item['pattern'];

  if (typeof pattern !== 'string' || pattern.length === 0) {
    throw new Error('import item: pattern is missing or not a string');
  }

  return pattern;
}

function decisionFieldOf(item: Readonly<Record<string, unknown>>): PermissionDecision {
  const decision = item['decision'];

  if (decision !== 'allow' && decision !== 'deny') {
    throw new Error('import item: decision is not allow/deny');
  }

  return decision;
}

function scopeFieldOf(
  item: Readonly<Record<string, unknown>>,
): Extract<PermissionRuleScope, 'project' | 'always'> {
  const scope = item['scope'];

  if (scope !== 'project' && scope !== 'always') {
    throw new Error('import item: scope is not project/always');
  }

  return scope;
}

function projectPathFieldOf(item: Readonly<Record<string, unknown>>): string {
  const projectPath = item['projectPath'];

  if (typeof projectPath !== 'string' || projectPath.length === 0) {
    throw new Error('import item: projectPath is missing or not a string');
  }

  return projectPath;
}

function engineFieldOf(item: Readonly<Record<string, unknown>>): string | null {
  const engine = item['engine'];

  if (engine !== undefined && typeof engine !== 'string') {
    throw new Error('import item: engine is not a string');
  }

  return engine ?? null;
}
