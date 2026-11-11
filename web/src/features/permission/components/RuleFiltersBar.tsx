import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import type { PermissionDecision, PersistedScope } from '../types/permission';
import type { PermissionRule } from '../types/rule';

export interface RuleFiltersValue {
  readonly decision?: PermissionDecision | undefined;
  readonly scope?: PersistedScope | undefined;
  readonly kind?: string | undefined;
  readonly folder?: string | undefined;
  readonly q?: string | undefined;
  readonly withAlert?: boolean | undefined;
}

export interface RuleFiltersBarProps {
  readonly value: RuleFiltersValue;
  onChange(next: RuleFiltersValue): void;

  /** The rules on the current page — where the kind and the folder options come from: there is no
   * route that lists every kind or folder over the whole set (a known limit of paging the listing,
   * plan 15, D-13). */
  readonly rules: readonly PermissionRule[];
}

const SELECT = 'h-10 rounded-md border border-border bg-transparent px-2 text-sm';
const CHIP = 'rounded-full px-3';

function kindsOf(rules: readonly PermissionRule[]): readonly string[] {
  return [
    ...new Set(rules.map((rule) => rule.kind).filter((kind): kind is string => kind !== null)),
  ].sort();
}

function foldersOf(rules: readonly PermissionRule[]): readonly string[] {
  return [
    ...new Set(
      rules.map((rule) => rule.projectPath).filter((path): path is string => path !== null),
    ),
  ].sort();
}

/** One field of `RuleFiltersValue`, present only when its value is not `undefined` — the one safe
 * way to carry an optional field through under `exactOptionalPropertyTypes`. */
function field<K extends string, V>(key: K, value: V | undefined): { readonly [P in K]?: V } {
  return value === undefined ? {} : ({ [key]: value } as { readonly [P in K]?: V });
}

/** A patch: each field present with a value, present as `undefined` (clear it), or absent (leave
 * it as it was) — the three states `replacing` tells apart with `in`. The same shape as
 * `RuleFiltersValue` field for field, so it reuses that type rather than redeclaring it. */
type FilterPatch = RuleFiltersValue;

/** The next filters, with one field replaced — every other field carried exactly as it was. */
function replacing(value: RuleFiltersValue, patch: FilterPatch): RuleFiltersValue {
  const decision = 'decision' in patch ? patch.decision : value.decision;
  const scope = 'scope' in patch ? patch.scope : value.scope;
  const kind = 'kind' in patch ? patch.kind : value.kind;
  const folder = 'folder' in patch ? patch.folder : value.folder;
  const q = 'q' in patch ? patch.q : value.q;
  const withAlert = 'withAlert' in patch ? patch.withAlert : value.withAlert;

  return {
    ...field('decision', decision),
    ...field('scope', scope),
    ...field('kind', kind),
    ...field('folder', folder),
    ...field('q', q),
    ...field('withAlert', withAlert),
  };
}

/** One toggle chip — decisão, escopo and "com alerta" are all the same control, pressed or not. */
function FilterChip({
  pressed,
  onClick,
  children,
}: {
  readonly pressed: boolean;
  onClick(): void;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Button
      type="button"
      size="touch"
      variant="outline"
      className={CHIP}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/** One `<select>` of the bar — kind and folder both pick one of the values the rules on the page
 * carry, with "any" clearing the filter. */
function FilterSelect({
  label,
  anyLabel,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly anyLabel: string;
  readonly value: string;
  readonly options: readonly string[];
  onChange(next: string): void;
}): React.JSX.Element {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="sr-only">{label}</span>
      <select
        className={SELECT}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        <option value="">{anyLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Decisão, escopo, tipo, pasta, "com alerta" and the search — every filter the table reads, applied
 * as soon as it changes: a chip or a select has nothing to draft, unlike the trail's own free-text
 * period (S-156, the search is the state).
 */
export function RuleFiltersBar({ value, onChange, rules }: RuleFiltersBarProps): React.JSX.Element {
  const { t } = useTranslation();
  const [q, setQ] = useState(value.q ?? '');
  const kinds = useMemo(() => kindsOf(rules), [rules]);
  const folders = useMemo(() => foldersOf(rules), [rules]);

  const toggleDecision = (decision: PermissionDecision): void => {
    onChange(replacing(value, { decision: value.decision === decision ? undefined : decision }));
  };

  const toggleScope = (scope: PersistedScope): void => {
    onChange(replacing(value, { scope: value.scope === scope ? undefined : scope }));
  };

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      aria-label={t('rules.filters.label')}
      onSubmit={(event) => {
        event.preventDefault();
        onChange(replacing(value, { q: q.trim() === '' ? undefined : q.trim() }));
      }}
    >
      <FilterChip
        pressed={value.decision === 'allow'}
        onClick={() => {
          toggleDecision('allow');
        }}
      >
        {t('rules.decision.allow')}
      </FilterChip>
      <FilterChip
        pressed={value.decision === 'deny'}
        onClick={() => {
          toggleDecision('deny');
        }}
      >
        {t('rules.decision.deny')}
      </FilterChip>

      <FilterChip
        pressed={value.scope === 'always'}
        onClick={() => {
          toggleScope('always');
        }}
      >
        {t('rules.scope.always')}
      </FilterChip>
      <FilterChip
        pressed={value.scope === 'project'}
        onClick={() => {
          toggleScope('project');
        }}
      >
        {t('rules.scope.project')}
      </FilterChip>

      <FilterSelect
        label={t('rules.filters.kind')}
        anyLabel={t('rules.filters.anyKind')}
        value={value.kind ?? ''}
        options={kinds}
        onChange={(kind) => {
          onChange(replacing(value, { kind: kind === '' ? undefined : kind }));
        }}
      />

      <FilterSelect
        label={t('rules.filters.folder')}
        anyLabel={t('rules.filters.anyFolder')}
        value={value.folder ?? ''}
        options={folders}
        onChange={(folder) => {
          onChange(replacing(value, { folder: folder === '' ? undefined : folder }));
        }}
      />

      <FilterChip
        pressed={value.withAlert === true}
        onClick={() => {
          onChange(replacing(value, { withAlert: value.withAlert === true ? undefined : true }));
        }}
      >
        {t('rules.filters.withAlert')}
      </FilterChip>

      <label className="flex flex-col gap-1 text-xs">
        <span className="sr-only">{t('rules.filters.search')}</span>
        <input
          className={SELECT}
          value={q}
          placeholder={t('rules.filters.search')}
          onChange={(event) => {
            setQ(event.target.value);
          }}
        />
      </label>
      <Button type="submit" size="touch" variant="outline">
        {t('rules.filters.apply')}
      </Button>
    </form>
  );
}
