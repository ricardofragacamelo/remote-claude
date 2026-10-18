import { useTranslation } from 'react-i18next';

import { ErrorState } from '@/shared/components/ErrorState';
import { LearnMore } from '@/shared/components/LearnMore';
import { LoadStatus } from '@/shared/components/LoadStatus';
import { Button } from '@/shared/components/ui/button';
import { useInstallation } from '../hooks/useInstallation';
import type {
  ClaudeInstallation,
  ModelCheckOutcome,
  ModelCheckResult,
  ReadVersion,
} from '../types/installation';
import { Facts } from './Facts';

/** What the test found, named in full. */
const RESULTS: Readonly<Record<ModelCheckResult, string>> = {
  ok: 'engines.claude.installation.checkOk',
  notLoggedIn: 'engines.claude.installation.checkNotLoggedIn',
  rateLimited: 'engines.claude.installation.checkRateLimited',
  failed: 'engines.claude.installation.checkFailed',
};

/** What the last answer said of the login, named in full. */
const LOGIN: Readonly<Record<ClaudeInstallation['login'], string>> = {
  ready: 'engines.claude.installation.loginReady',
  loginRequired: 'engines.claude.installation.loginRequired',
  unknown: 'engines.claude.installation.loginUnknown',
};

/**
 * "Instalação": the diagnostic that answers "why does Claude not work here?" — the SDK, the binary
 * it spawns and the `claude` on `PATH` (marked when they differ), the configuration directory, the
 * login, and the test of the connection, which says what it spends **before** the click (plan 13,
 * B-11, B-12).
 */
export function InstallationSection(): React.JSX.Element {
  const { t } = useTranslation();
  const state = useInstallation();
  // Why a version is missing, named in full: nothing there, or something there that is not legible.
  const version = (read: ReadVersion): string =>
    read.version ??
    t(
      read.reason === 'notInstalled'
        ? 'engines.claude.installation.notInstalled'
        : 'engines.claude.installation.unreadable',
    );

  return (
    <div className="flex flex-col gap-4">
      <LoadStatus
        isLoading={state.isLoading}
        loadingLabel={t('engines.claude.installation.loading')}
        error={state.error}
        onRetry={state.retry}
        rows={5}
      />
      {state.installation !== null && (
        <Facts
          label={t('engines.claude.installation.title')}
          facts={[
            {
              label: t('engines.claude.installation.agentSdk'),
              value: version(state.installation.agentSdk),
            },
            {
              label: t('engines.claude.installation.bundledCli'),
              value: version(state.installation.bundledCli),
            },
            {
              label: t('engines.claude.installation.pathCli'),
              value: version(state.installation.pathCli),
              ...(state.installation.pathCli.differs
                ? { note: t('engines.claude.installation.pathCliDiffers') }
                : {}),
            },
            {
              label: t('engines.claude.installation.configDir'),
              value: state.installation.configDir.path,
              note: t(
                state.installation.configDir.fromEnvironment
                  ? 'engines.claude.installation.configDirFromEnvironment'
                  : 'engines.claude.installation.configDirDefault',
              ),
            },
            {
              label: t('engines.claude.installation.login'),
              value: t(LOGIN[state.installation.login]),
            },
          ]}
        />
      )}

      <section aria-labelledby="claude-model-check" className="flex flex-col gap-2">
        <h3 id="claude-model-check" className="text-ui font-ui-strong">
          {t('engines.claude.installation.checkTitle')}
        </h3>
        <p className="text-ui-sm text-muted-foreground">
          {t('engines.claude.installation.checkCost')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            id="claude-model-check-button"
            size="touch"
            disabled={state.checking}
            onClick={() => {
              state.check();
            }}
          >
            {t(
              state.checking
                ? 'engines.claude.installation.checking'
                : 'engines.claude.installation.check',
            )}
          </Button>
          <LearnMore section="claude-check" topic={t('engines.claude.installation.checkTitle')} />
        </div>
        {state.checkError !== null && <ErrorState error={state.checkError} />}
        {state.outcome !== null && <CheckOutcome outcome={state.outcome} />}
      </section>
    </div>
  );
}

/** What the last test found, said as a result — the test ran, whatever it found. */
function CheckOutcome({ outcome }: { readonly outcome: ModelCheckOutcome }): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <p role="status" className="text-ui">
      {t(RESULTS[outcome.result])}{' '}
      {t('engines.claude.installation.checkDetails', {
        model: outcome.model ?? '—',
        latency: outcome.latencyMs,
        cost: outcome.costUsd === null ? '—' : Number(outcome.costUsd).toFixed(4),
      })}
    </p>
  );
}
