import { useCallback } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { AUDIT_DECISIONS, AuditTrail } from '@/features/audit';
import type { AuditDecision, AuditFilters } from '@/features/audit';
import { ScreenFrame } from '@/shared/components/ScreenFrame';
import { useShellShortcuts } from './screen-shortcuts';

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
 * `/audit` — "what ran on my machine without asking me?"
 *
 * The filters are in the **search**, not in state: a filtered trail pasted on another device is the
 * same screen (docs/architecture/web/04-state-and-data.md#a-url-é-estado). From an entry a rule
 * answered, the rule opens — the second of the two ways in to the rules that D-04 requires.
 */
export function AuditRoute(): React.JSX.Element {
  const shortcuts = useShellShortcuts();
  const { t } = useTranslation();
  const filters = useSearch({ from: '/_frame/audit' });
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
    <ScreenFrame
      title={t('audit.screen.title')}
      purpose={t('audit.screen.purpose')}
      help="audit.help"
      shortcuts={shortcuts}
    >
      <AuditTrail filters={filters} onFilter={filter} onOpenRule={openRule} />
    </ScreenFrame>
  );
}
