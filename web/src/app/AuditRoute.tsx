import { useCallback } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { AUDIT_DECISIONS, AuditTrail } from '@/features/audit';
import type { AuditDecision, AuditFilters } from '@/features/audit';
import { Screen, SignedIn } from './Screen';

/** A search parameter as a non-empty string, or nothing. */
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function isDecision(value: unknown): value is AuditDecision {
  return typeof value === 'string' && (AUDIT_DECISIONS as readonly string[]).includes(value);
}

/**
 * The filters of the trail, read from the URL — and only what is well formed.
 *
 * A link can say anything; what it says wrongly is dropped rather than sent, so a hand-edited URL
 * shows the trail it can, and never an error the person did not cause by clicking. Anything the
 * server still refuses — a period that ends before it starts — comes back as its own message.
 */
export function readAuditSearch(search: Readonly<Record<string, unknown>>): AuditFilters {
  const filters: {
    sessionId?: string;
    toolName?: string;
    decision?: AuditDecision;
    from?: string;
    to?: string;
  } = {};
  const sessionId = text(search['sessionId']);
  const toolName = text(search['toolName']);
  const from = text(search['from']);
  const to = text(search['to']);

  if (sessionId !== undefined) filters.sessionId = sessionId;
  if (toolName !== undefined) filters.toolName = toolName;
  if (isDecision(search['decision'])) filters.decision = search['decision'];
  if (from !== undefined) filters.from = from;
  if (to !== undefined) filters.to = to;

  return filters;
}

/**
 * The trail's own address, filters included — where a sign-in comes back to.
 *
 * `/audit` alone would bring somebody who opened a filtered trail signed out back to the whole of
 * it: the link would work only for whoever was already signed in, which is not what a link is.
 */
export function auditLocation(filters: AuditFilters): string {
  const search = new URLSearchParams(
    Object.entries(filters).filter((entry): entry is [string, string] => entry[1] !== undefined),
  ).toString();

  return search === '' ? '/audit' : `/audit?${search}`;
}

/**
 * `/audit` — "what ran on my machine without asking me?"
 *
 * The filters are in the **search**, not in state: a filtered trail pasted on another device is the
 * same screen (docs/architecture/web/04-state-and-data.md#a-url-é-estado). From an entry a rule
 * answered, the rule opens — the second of the two ways in to the rules that D-04 requires.
 */
export function AuditRoute(): React.JSX.Element {
  const { t } = useTranslation();
  const filters = useSearch({ from: '/audit' });
  const navigate = useNavigate();

  const filter = useCallback(
    (next: AuditFilters) => {
      void navigate({ to: '/audit', search: next });
    },
    [navigate],
  );

  const openRule = useCallback(
    (ruleId: string) => {
      void navigate({ to: '/rules/$ruleId', params: { ruleId } });
    },
    [navigate],
  );

  return (
    <Screen
      title={t('audit.screen.title')}
      links={[
        { to: '/', label: t('audit.screen.back') },
        { to: '/rules', label: t('rules.screen.open') },
      ]}
    >
      <SignedIn returnTo={auditLocation(filters)}>
        <AuditTrail filters={filters} onFilter={filter} onOpenRule={openRule} />
      </SignedIn>
    </Screen>
  );
}
