import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import { useAuth } from '../hooks/useAuth';

/**
 * Signs out — here, and then at the provider.
 *
 * Disabled while the sign-out runs, so a second press does not start a second one against a cookie
 * the first has already dropped.
 */
export function SignOutButton(): React.JSX.Element {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="outline"
      size="touch"
      disabled={pending}
      onClick={() => {
        setPending(true);
        void logout().finally(() => setPending(false));
      }}
    >
      {t('auth.signOut.action')}
    </Button>
  );
}
