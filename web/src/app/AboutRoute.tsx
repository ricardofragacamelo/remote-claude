import { AboutScreen } from '@/features/about';
import { ScreenFrame } from '@/shared/components/ScreenFrame';
import { useFramedScreen } from './screen-shortcuts';

/**
 * `/about` — reached from the "manage" menu and from the palette: the versions of the installation,
 * ready to paste into a bug report, and where the project's documentation is (plan 06, B-32).
 */
export function AboutRoute(): React.JSX.Element {
  return (
    <ScreenFrame
      help="about.help"
      {...useFramedScreen('about.screen.title', 'about.screen.purpose')}
    >
      <AboutScreen />
    </ScreenFrame>
  );
}
