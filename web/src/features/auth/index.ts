/** Public surface of the `auth` feature. Another feature imports this file, never a deep path. */
export { SignInPrompt } from './components/SignInPrompt';
export { useAuth } from './hooks/useAuth';
export { useAuthStore, renewalDelay } from './store/auth.store';
export type { AuthSession } from './types/session';
export {
  beginLogin,
  completeLogin,
  endSession,
  renewSession,
  returnRoute,
  CALLBACK_PATH,
} from './services/auth.service';
