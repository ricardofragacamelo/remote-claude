import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';

export interface RuleBatchBarProps {
  readonly count: number;
  onRevoke(): void;
  onClear(): void;
}

/**
 * The bar a selection raises over the table — how many, and the one write ready today: Revogar
 * (S-173). Exportar is the batch action the plan's own text names beside it, but there is no
 * export flow yet to open — B-31's own hand-off, the same shape as Simular/Duplicar were for B-22.
 */
export function RuleBatchBar({ count, onRevoke, onClear }: RuleBatchBarProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div
      className="flex items-center justify-between gap-2 rounded-md border border-border bg-accent/40 p-2"
      role="status"
    >
      <span className="text-ui-sm">{t('rules.batch.selectedCount', { count })}</span>
      <div className="flex gap-2">
        <Button variant="outline" size="touch" onClick={onClear}>
          {t('rules.batch.clearSelection')}
        </Button>
        <Button variant="destructive" size="touch" onClick={onRevoke}>
          {t('rules.action.revoke')}
        </Button>
      </div>
    </div>
  );
}
