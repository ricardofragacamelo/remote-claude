import { useState } from 'react';

import type { AppError } from '@/shared/api/errors';
import { fetchRuleExport } from '../services/rule.service';
import { downloadRuleExportFile } from '../lib/rule-export-download';
import type { RuleFilters } from '../types/rule';

export interface RuleExportSubmit {
  readonly exporting: boolean;
  readonly error: AppError | null;
  download(filters: Readonly<RuleFilters>): Promise<void>;
}

/**
 * "Exportar" (plan 15, B-31, D-17) — whatever the current filter shows, never a selection: the
 * server's own export route is filter-only (the same the listing and the summary already read),
 * and the trail already records this call on its own (`permission.rulesExported`), so there is
 * nothing else for the web to log.
 */
export function useRuleExport(): RuleExportSubmit {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  return {
    exporting,
    error,
    download: async (filters) => {
      setExporting(true);
      setError(null);

      try {
        const payload = await fetchRuleExport(filters);
        downloadRuleExportFile(payload, new Date());
      } catch (caught) {
        setError(caught as AppError);
      } finally {
        setExporting(false);
      }
    },
  };
}
