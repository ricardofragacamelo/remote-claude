import { ClipboardCopy, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { LoadStatus } from '@/shared/components/LoadStatus';
import { Panel } from '@/shared/components/Panel';
import { Button } from '@/shared/components/ui/button';
import type { CopyState } from '@/shared/hooks/useCopy';
import { useVersionLabels, useVersions } from '../hooks/useVersions';
import { INSTALLATION_COMPONENTS } from '../types/about';

/**
 * Where the documentation of the project lives — the index of its `docs/`. Not a provider, not a
 * secret: the address of the repository this web was built from.
 */
export const DOCUMENTATION_URL =
  'https://github.com/ricardofragacamelo/remote-claude/tree/main/docs';

/**
 * About: the versions of the web, the backend, the Agent SDK, Claude's CLI and Node, with "copy" of
 * the whole block for a bug report — and the documentation and the license (plan 06, B-32).
 *
 * The web's version is on screen whatever the backend answers: it is the bundle's own. A version
 * that could not be read says so, with the reason; the backend unreachable is an error with "try
 * again" (S-204). The repository declares no license, and the screen says exactly that rather than
 * inventing one ([06 · D-32](../../../../../docs/plans/06-workbench/decisions.md#d-32--o-que-a-f5-decidiu-na-execução)).
 */
export function AboutScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const versions = useVersions();
  const { nameOf, valueOf } = useVersionLabels();
  const { installation } = versions;

  return (
    <>
      <Panel title={t('about.versions.title')} description={t('about.versions.description')}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-ui">
          <dt className="text-muted-foreground">{nameOf('web')}</dt>
          <dd className="font-code">{versions.web}</dd>
          {installation !== null &&
            INSTALLATION_COMPONENTS.map((component) => (
              <div key={component} className="contents">
                <dt className="text-muted-foreground">{nameOf(component)}</dt>
                <dd
                  className={
                    installation[component].version === null ? 'text-destructive' : 'font-code'
                  }
                >
                  {valueOf(installation[component])}
                </dd>
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
