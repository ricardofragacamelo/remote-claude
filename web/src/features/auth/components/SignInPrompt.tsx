import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';
import { useAuth } from '../hooks/useAuth';

export interface SignInPromptProps {
  readonly returnTo: string;
}

/** The sign-in screen. It knows there is a login; it does not know the login is OIDC. */
export function SignInPrompt({ returnTo }: SignInPromptProps): React.JSX.Element {
  const { t } = useTranslation();
  const { login } = useAuth();

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>{t('auth.signIn.title')}</CardTitle>
        <CardDescription>{t('auth.signIn.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          size="touch"
          onClick={() => {
            void login(returnTo);
          }}
        >
          {t('auth.signIn.action')}
        </Button>
      </CardContent>
    </Card>
  );
}
