import { useCallback, useState } from 'react';

import { AUDIT_DECISIONS } from '../types/audit';
import type { AuditDecision, AuditFilters } from '../types/audit';

/** The form as the inputs hold it: text, and local date-times without a zone. */
export interface AuditFilterFields {
  readonly sessionId: string;
  readonly toolName: string;

  /** `''` is "any decision". */
  readonly decision: AuditDecision | '';

  /** `datetime-local` values: `YYYY-MM-DDTHH:mm`, in the zone of this browser. */
  readonly from: string;
  readonly to: string;
}

export interface AuditFilterDraft {
  readonly fields: AuditFilterFields;
  set<K extends keyof AuditFilterFields>(field: K, value: string): void;
  apply(): void;
  clear(): void;
}

/** An ISO instant as a `datetime-local` value, in this browser's zone. `''` for none. */
export function toLocalInput(iso: string | undefined): string {
  if (iso === undefined) {
    return '';
  }

  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) {
    return '';
  }

  const local = new Date(instant.getTime() - instant.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/** A `datetime-local` value as the ISO instant the server filters by. `undefined` for none. */
export function fromLocalInput(value: string): string | undefined {
  if (value === '') {
    return undefined;
  }

  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? undefined : instant.toISOString();
}

function fieldsOf(filters: AuditFilters): AuditFilterFields {
  return {
    sessionId: filters.sessionId ?? '',
    toolName: filters.toolName ?? '',
    decision: filters.decision ?? '',
    from: toLocalInput(filters.from),
    to: toLocalInput(filters.to),
  };
}

function isDecision(value: string): value is AuditDecision {
  return (AUDIT_DECISIONS as readonly string[]).includes(value);
}

/**
 * The filter form: what is typed, and applying it.
 *
 * Typing does not query. The filters are the URL's, and a URL that changed on every keystroke
 * would be a request per keystroke and a history nobody can go back through; the form holds a
 * draft, and applying it is one navigation.
 *
 * The draft starts from the filters it was given and does not follow them afterwards: the form is
 * keyed by the filters where it is rendered, so when the URL changes by itself — back, a link — it
 * is a new form rather than an old one being corrected.
 */
export function useAuditFilterDraft(
  filters: AuditFilters,
  onApply: (next: AuditFilters) => void,
): AuditFilterDraft {
  const [fields, setFields] = useState<AuditFilterFields>(() => fieldsOf(filters));

  const set = useCallback(<K extends keyof AuditFilterFields>(field: K, value: string) => {
    setFields((previous) => ({ ...previous, [field]: value }));
  }, []);

  const apply = useCallback(() => {
    const next: {
      sessionId?: string;
      toolName?: string;
      decision?: AuditDecision;
      from?: string;
      to?: string;
    } = {};
    const trimmedSession = fields.sessionId.trim();
    const trimmedTool = fields.toolName.trim();
    const fromIso = fromLocalInput(fields.from);
    const toIso = fromLocalInput(fields.to);

    if (trimmedSession !== '') next.sessionId = trimmedSession;
    if (trimmedTool !== '') next.toolName = trimmedTool;
    if (isDecision(fields.decision)) next.decision = fields.decision;
    if (fromIso !== undefined) next.from = fromIso;
    if (toIso !== undefined) next.to = toIso;

    onApply(next);
  }, [fields, onApply]);

  const clear = useCallback(() => {
    onApply({});
  }, [onApply]);

  return { fields, set, apply, clear };
}
