import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/shared/components/EmptyState';
import { Screen } from './Screen';

/**
 * What an address no route answers shows — in the user's language, with the way back.
 *
 * It is the same screen for a link that was never valid, for one a plan removed
 * ([06 · D-07](../../../docs/plans/06-workbench/decisions.md#d-07--o-destino-da-home-e-das-rotas-antigas))
 * and for one reserved to a plan that has not registered it yet (`/claude…`, `/usage…`): a route
 * that nobody fills renders this, never an empty frame (plan 06, S-07). It sits outside the sign-in
 * gate on purpose — the table of routes ships in the bundle, so saying one is not there tells a
 * stranger nothing.
 */
export function NotFoundRoute(): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <Screen
      title={t('common.notFound.title')}
      links={[{ to: '/', label: t('common.notFound.home') }]}
    >
      <EmptyState
        title={t('common.error.notFound')}
        description={t('common.notFound.description')}
      />
    </Screen>
  );
}
