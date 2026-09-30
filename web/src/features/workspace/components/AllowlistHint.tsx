import { Check, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { LearnMore } from '@/shared/components/LearnMore';
import { Button } from '@/shared/components/ui/button';
import { useCopy } from '@/shared/hooks/useCopy';

/**
 * How to let this installation open another folder — the command, ready to copy.
 *
 * The allowlist is read-only here on purpose: changing it takes access to the disk of the machine,
 * which is the whole reason it is a file (docs/architecture/backend/03-modules.md#workspace). So the
 * screen does the next best thing, and says exactly what to run and **where** — on the machine the
 * backend runs on, not on the phone this may be read from.
 */
export interface AllowlistHintProps {
  /** The anchor the search of Settings takes the person to. */
  readonly id?: string;

  /**
   * Offers the screen's help about the allowlist. Not inside a dialog: the help would open behind it.
   */
  readonly learnMore?: boolean;
}

export function AllowlistHint({ id, learnMore = false }: AllowlistHintProps): React.JSX.Element {
  const { t } = useTranslation();
  const command = t('workspace.allowlist.command');
  const { state, copy } = useCopy(command);

  return (
    <div
      id={id}
      tabIndex={id === undefined ? undefined : -1}
      className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-4"
    >
      <p className="text-sm font-medium">{t('workspace.allowlist.title')}</p>
      <p className="text-sm text-muted-foreground">{t('workspace.allowlist.description')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded bg-muted px-2 py-1 font-mono text-xs select-all">{command}</code>
        <Button
          variant="outline"
          className="h-8 px-3"
          onClick={() => {
            copy();
          }}
        >
          {state === 'copied' ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <Copy className="size-4" aria-hidden />
          )}
          {state === 'copied' ? t('workspace.allowlist.copied') : t('workspace.allowlist.copy')}
        </Button>
      </div>
      {state === 'failed' && (
        <p role="alert" className="text-xs text-destructive">
          {t('workspace.allowlist.copyFailed')}
        </p>
      )}
      {learnMore && <LearnMore section="states" topic={t('help.topic.allowlist')} />}
    </div>
  );
}
