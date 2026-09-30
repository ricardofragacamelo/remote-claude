import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/shared/components/EmptyState';
import { AppFrame } from './AppFrame';

/**
 * What an address no route answers shows — in the user's language, with the way back.
 *
 * It is the same screen for a link that was never valid, for one a plan removed
 * ([06 · D-07](../../../docs/plans/06-workbench/decisions.md#d-07--o-destino-da-home-e-das-rotas-antigas))
 * and for one reserved to a plan that has not registered it yet (`/claude…`, `/usage…`): a route
 * that nobody fills renders this, never an empty frame (plan 06, S-07). It sits in the frame but
 * outside the sign-in gate on purpose — the table of routes ships in the bundle, so saying one is
 * not there tells a stranger nothing.
 */
export function NotFoundRoute(): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <AppFrame>
      <div className="flex flex-col gap-4 p-4 md:p-8">
        <h1 className="text-lg font-ui-strong">{t('common.notFound.title')}</h1>
        <EmptyState
          title={t('common.error.notFound')}
          description={t('common.notFound.description')}
        />
        <Link to="/" className="text-ui underline underline-offset-4">
          {t('common.notFound.home')}
        </Link>
      </div>
    </AppFrame>
  );
}
