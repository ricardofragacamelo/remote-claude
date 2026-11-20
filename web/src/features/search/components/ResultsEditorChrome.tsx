import { AlertTriangle, RotateCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import type { FileChromeProps } from '@/features/editor';
import { MAX_CONTEXT_LINES, MIN_CONTEXT_LINES, useResultsEditor } from '../hooks/useResultsEditor';

/**
 * The header a `.code-search` tab shows above its own editor (plan 11, B-17): the consultation it
 * was opened with, the context-lines spinner, and "run again" — registered as the editor's own
 * `fileChrome` (`search/register.ts`), picked by the file's extension alone.
 */
export function ResultsEditorChrome({ folder, doc }: FileChromeProps): React.JSX.Element {
  const { t } = useTranslation();
  const { header, isRunning, error, setContextLines, runAgain } = useResultsEditor(folder, doc);

  return (
    <div className="flex shrink-0 flex-col gap-1 border-b border-border px-3 py-2 text-ui-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <p>
          <span className="font-medium">{t('search.resultsEditor.query')}</span> {header.query}
        </p>
        <label className="flex items-center gap-2">
          {t('search.resultsEditor.contextLines')}
          <input
            type="number"
            min={MIN_CONTEXT_LINES}
            max={MAX_CONTEXT_LINES}
            value={header.contextLines}
            aria-label={t('search.resultsEditor.contextLines')}
            className="h-7 w-14 rounded-md border border-border bg-background px-2 text-ui-sm"
            onChange={(event) => {
              const value = Number.parseInt(event.target.value, 10);
              if (!Number.isNaN(value)) {
                setContextLines(value);
              }
            }}
          />
        </label>
        <Button
          variant="outline"
          className="h-touch gap-2 px-3 md:h-7"
          disabled={isRunning}
          onClick={runAgain}
        >
          <RotateCw className="size-4" aria-hidden />
          {t(isRunning ? 'search.resultsEditor.running' : 'search.resultsEditor.runAgain')}
        </Button>
      </div>
      <p className="text-muted-foreground">{t('search.resultsEditor.readOnlyNotice')}</p>
      {error !== null && (
        <p role="alert" className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          {t(error.messageKey, error.params)}
        </p>
      )}
    </div>
  );
}
