import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/shared/components/EmptyState';
import { IconButton } from '@/shared/components/IconButton';
import { LearnMore } from '@/shared/components/LearnMore';
import { LoadStatus } from '@/shared/components/LoadStatus';
import { useAccount } from '../hooks/useAccount';
import type { ClaudeAccount } from '../types/installation';
import { Facts } from './Facts';

/** The facts of the account, each with its label named in full. */
const FIELDS: readonly { readonly key: keyof ClaudeAccount; readonly label: string }[] = [
  { key: 'provider', label: 'claudeSettings.account.provider' },
  { key: 'plan', label: 'claudeSettings.account.plan' },
  { key: 'organization', label: 'claudeSettings.account.organization' },
  { key: 'email', label: 'claudeSettings.account.email' },
  { key: 'tokenSource', label: 'claudeSettings.account.tokenSource' },
  { key: 'apiKeySource', label: 'claudeSettings.account.apiKeySource' },
];

/**
 * "Conta": who Claude bills on this machine (plan 13, B-11, D-07). A CLI nobody signed in to is a
 * state with the way out, never an error: the product does not sign anyone in remotely — the screen
 * says what to run on the machine.
 */
export function AccountSection(): React.JSX.Element {
  const { t } = useTranslation();
  const { account, isLoading, error, retry, refresh } = useAccount();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <IconButton
          icon={RefreshCw}
          label={t('claudeSettings.account.refresh')}
          onClick={refresh}
        />
        <LearnMore section="claude-account" topic={t('claudeSettings.account.title')} />
      </div>
      <LoadStatus
        isLoading={isLoading}
        loadingLabel={t('claudeSettings.account.loading')}
        error={error}
        onRetry={retry}
        rows={4}
      />
      {account?.state === 'loginRequired' && (
        <EmptyState
          title={t('claudeSettings.account.loginRequiredTitle')}
          description={t('claudeSettings.account.loginRequiredBody')}
        />
      )}
      {account?.state === 'ready' && (
        <Facts
          label={t('claudeSettings.account.title')}
          facts={FIELDS.map((field) => ({
            label: t(field.label),
            value: account[field.key] ?? t('claudeSettings.account.notSaid'),
          }))}
        />
      )}
    </div>
  );
}
