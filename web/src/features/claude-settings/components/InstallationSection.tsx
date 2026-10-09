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
  ok: 'claudeSettings.installation.checkOk',
  notLoggedIn: 'claudeSettings.installation.checkNotLoggedIn',
  rateLimited: 'claudeSettings.installation.checkRateLimited',
  failed: 'claudeSettings.installation.checkFailed',
};

/** What the last answer said of the login, named in full. */
const LOGIN: Readonly<Record<ClaudeInstallation['login'], string>> = {
  ready: 'claudeSettings.installation.loginReady',
  loginRequired: 'claudeSettings.installation.loginRequired',
  unknown: 'claudeSettings.installation.loginUnknown',
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
        ? 'claudeSettings.installation.notInstalled'
        : 'claudeSettings.installation.unreadable',
    );

  return (
    <div className="flex flex-col gap-4">
      <LoadStatus
        isLoading={state.isLoading}
        loadingLabel={t('claudeSettings.installation.loading')}
        error={state.error}
        onRetry={state.retry}
        rows={5}
      />
      {state.installation !== null && (
        <Facts
          label={t('claudeSettings.installation.title')}
          facts={[
            {
              label: t('claudeSettings.installation.agentSdk'),
              value: version(state.installation.agentSdk),
            },
            {
              label: t('claudeSettings.installation.bundledCli'),
              value: version(state.installation.bundledCli),
            },
            {
              label: t('claudeSettings.installation.pathCli'),
              value: version(state.installation.pathCli),
              ...(state.installation.pathCli.differs
                ? { note: t('claudeSettings.installation.pathCliDiffers') }
                : {}),
            },
            {
              label: t('claudeSettings.installation.configDir'),
              value: state.installation.configDir.path,
              note: t(
                state.installation.configDir.fromEnvironment
                  ? 'claudeSettings.installation.configDirFromEnvironment'
                  : 'claudeSettings.installation.configDirDefault',
              ),
            },
            {
              label: t('claudeSettings.installation.login'),
              value: t(LOGIN[state.installation.login]),
            },
          ]}
        />
      )}

      <section aria-labelledby="claude-model-check" className="flex flex-col gap-2">
        <h3 id="claude-model-check" className="text-ui font-ui-strong">
          {t('claudeSettings.installation.checkTitle')}
        </h3>
        <p className="text-ui-sm text-muted-foreground">
          {t('claudeSettings.installation.checkCost')}
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
                ? 'claudeSettings.installation.checking'
                : 'claudeSettings.installation.check',
            )}
          </Button>
          <LearnMore section="claude-check" topic={t('claudeSettings.installation.checkTitle')} />
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
      {t('claudeSettings.installation.checkDetails', {
        model: outcome.model ?? '—',
        latency: outcome.latencyMs,
        cost: outcome.costUsd === null ? '—' : outcome.costUsd.toFixed(4),
      })}
    </p>
  );
}
