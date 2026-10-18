import { ClipboardCopy, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { LoadStatus } from '@/shared/components/LoadStatus';
import { Panel } from '@/shared/components/Panel';
import { Button } from '@/shared/components/ui/button';
import type { CopyState } from '@/shared/hooks/useCopy';
import { useVersions } from '../hooks/useVersions';

/**
 * Where the documentation of the project lives — the index of its `docs/`. Not a provider, not a
 * secret: the address of the repository this web was built from.
 */
export const DOCUMENTATION_URL =
  'https://github.com/ricardofragacamelo/remote-claude/tree/main/docs';

/**
 * About: the versions of the web, the backend, Node and each engine enabled — its library and its
 * command-line tool — with "copy" of the whole block for a bug report, and the documentation and
 * the license (plan 06, B-32; plan 28, B-37, B-39).
 *
 * The web's version is on screen whatever the backend answers: it is the bundle's own. A version
 * that could not be read says so, with the reason; the backend unreachable is an error with "try
 * again" (S-204). The repository declares no license, and the screen says exactly that rather than
 * inventing one ([06 · D-32](../../../../../docs/plans/06-workbench/decisions.md#d-32--o-que-a-f5-decidiu-na-execução)).
 */
export function AboutScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const versions = useVersions();
  const { installation } = versions;

  return (
    <>
      <Panel title={t('about.versions.title')} description={t('about.versions.description')}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-ui">
          {versions.lines.map((line) => (
            <div key={line.name} className="contents">
              <dt className="text-muted-foreground">{line.name}</dt>
              <dd className={line.ok ? 'font-code' : 'text-destructive'}>{line.value}</dd>
            </div>
          ))}
        </dl>

        <LoadStatus
          isLoading={versions.isLoading}
          loadingLabel={t('about.versions.loading')}
          error={versions.error}
          onRetry={versions.reload}
        />

        {installation !== null && (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="touch" onClick={versions.copy}>
              <ClipboardCopy className="size-4" aria-hidden />
              {t('about.versions.copy')}
            </Button>
            <CopyOutcome state={versions.copyState} />
          </div>
        )}
      </Panel>

      <Panel title={t('about.project.title')} description={t('about.project.description')}>
        <a
          href={DOCUMENTATION_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-touch items-center gap-2 text-ui underline underline-offset-4 md:min-h-0"
        >
          {t('about.project.documentation')}
          <ExternalLink className="size-4" aria-hidden />
          <span className="sr-only">{t('about.project.newTab')}</span>
        </a>
        <p className="text-ui text-muted-foreground">{t('about.project.license')}</p>
      </Panel>
    </>
  );
}

/** What became of the last copy: nothing yet, done — or refused, and then how to do it by hand. */
function CopyOutcome({ state }: { readonly state: CopyState }): React.JSX.Element | null {
  const { t } = useTranslation();

  if (state === 'copied') {
    return (
      <p role="status" className="text-ui-sm text-muted-foreground">
        {t('about.versions.copied')}
      </p>
    );
  }

  return state === 'failed' ? (
    <p role="alert" className="text-ui-sm text-destructive">
      {t('about.versions.copyFailed')}
    </p>
  ) : null;
}
