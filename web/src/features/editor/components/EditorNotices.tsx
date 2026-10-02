import { CheckCircle2, X, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/shared/components/IconButton';
import { dismissSaveReport } from '../hooks/tabs';
import { useEditorState } from '../hooks/useEditor';

/**
 * What the editor says that has no other place: how "save all" went, file by file (S-234), and the
 * outcome of an action done from the keyboard — "added to Claude's context" — announced to a screen
 * reader as well (S-277).
 */
export function EditorNotices({ folder }: { readonly folder: string }): React.JSX.Element {
  const { t } = useTranslation();
  const report = useEditorState(folder, (state) => state.saveReport);
  const announcement = useEditorState(folder, (state) => state.announcement);

  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement === null ? '' : t(announcement.key, announcement.params)}
      </p>
      {report !== null && (
        <section
          aria-label={t('editor.saveAll.title')}
          className="flex shrink-0 flex-col gap-1 border-b border-border px-3 py-2 text-ui-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-ui-strong">
              {t('editor.saveAll.summary', {
                saved: report.filter((each) => each.saved).length,
                total: report.length,
              })}
            </h2>
            <IconButton
              icon={X}
              label={t('editor.saveAll.dismiss')}
              onClick={() => {
                dismissSaveReport(folder);
              }}
            />
          </div>
          <ul className="flex flex-col gap-0.5">
            {report.map((outcome) => (
              <li key={outcome.path} className="flex items-center gap-2">
                {outcome.saved ? (
                  <CheckCircle2 className="size-4 shrink-0" aria-hidden />
                ) : (
                  <XCircle className="size-4 shrink-0 text-destructive" aria-hidden />
                )}
                <span className="font-code break-all">{outcome.path}</span>
                <span className="text-muted-foreground">
                  {outcome.reasonKey === null
                    ? t('editor.saveAll.saved')
                    : t(outcome.reasonKey, outcome.params)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
