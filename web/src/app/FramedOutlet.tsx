import { Outlet } from '@tanstack/react-router';

import { KeepAgentNames } from '@/features/session';
import { AppFrame } from './AppFrame';
import { KeepTabsAttached } from './KeepTabsAttached';
import { ShellHosts } from './ShellHosts';
import { SignedIn } from './SignedIn';

/**
 * Every screen but the sign-in callback and "not found": inside the frame, and only for somebody
 * signed in. The gate is the frame's, so no screen can forget it
 * (docs/architecture/web/03-ui-system.md#a-moldura-do-app). And the sessions of the folder tabs are
 * held attached here, so a question asked while the person reads the trail is waiting in its tab —
 * and the services of the shell live here too: the palette, the File menu, the notifications — and
 * the names of the coding agents, which every text that says `{{agent}}` reads.
 */
export function FramedOutlet(): React.JSX.Element {
  return (
    <AppFrame>
      <SignedIn>
        <Outlet />
        <KeepTabsAttached />
        <KeepAgentNames />
        <ShellHosts />
      </SignedIn>
    </AppFrame>
  );
}
