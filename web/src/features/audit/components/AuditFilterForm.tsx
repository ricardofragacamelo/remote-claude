import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import { useAuditFilterDraft } from '../hooks/useAuditFilterDraft';
import { AUDIT_DECISIONS } from '../types/audit';
import type { AuditFilters } from '../types/audit';

export interface AuditFilterFormProps {
  readonly filters: AuditFilters;
  onApply(next: AuditFilters): void;
}

const INPUT = 'h-10 rounded-md border border-border bg-transparent px-3 text-sm';

/**
 * Session, tool, decision and period — the four filters the trail answers to.
 *
 * A draft until applied: the filters are the URL's, and one navigation per keystroke is a request
 * per keystroke. The period is half-open, and the labels say which end is included.
 */
export function AuditFilterForm({ filters, onApply }: AuditFilterFormProps): React.JSX.Element {
  const { t } = useTranslation();
  const { fields, set, apply, clear } = useAuditFilterDraft(filters, onApply);

  return (
    <form
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      aria-label={t('audit.filter.label')}
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
    >
      <label className="flex flex-col gap-1 text-xs">
        {t('audit.filter.session')}
        <input
          className={`${INPUT} font-mono`}
          value={fields.sessionId}
          onChange={(event) => {
            set('sessionId', event.target.value);
          }}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs">
        {t('audit.filter.tool')}
        <input
          className={INPUT}
          value={fields.toolName}
          onChange={(event) => {
            set('toolName', event.target.value);
          }}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs">
        {t('audit.filter.decision')}
        <select
          className={INPUT}
          value={fields.decision}
          onChange={(event) => {
            set('decision', event.target.value);
          }}
        >
          <option value="">{t('audit.filter.anyDecision')}</option>
          {AUDIT_DECISIONS.map((decision) => (
            <option key={decision} value={decision}>
              {t(`audit.decision.${decision}`)}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs">
          {t('audit.filter.from')}
          <input
            type="datetime-local"
            className={INPUT}
            value={fields.from}
            onChange={(event) => {
              set('from', event.target.value);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          {t('audit.filter.to')}
          <input
            type="datetime-local"
            className={INPUT}
            value={fields.to}
            onChange={(event) => {
              set('to', event.target.value);
            }}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" size="touch">
          {t('audit.filter.apply')}
        </Button>
        <Button type="button" variant="outline" size="touch" onClick={clear}>
          {t('audit.filter.clear')}
        </Button>
      </div>
    </form>
  );
}
