import { ConnectionPanel, PingPanel } from '@/features/diagnostics';
import { ScreenFrame } from '@/shared/components/ScreenFrame';
import { useFramedScreen } from './screen-shortcuts';

/**
 * `/diagnostics` — Logs and diagnostics, with what exists today: where the connection stands, the
 * way to reconnect, and the end-to-end round trip that left the home
 * ([06 · D-12](../../../docs/plans/06-workbench/decisions.md#d-12--o-que-a-tela-logs-e-diagnóstico-tem-neste-plano)).
 * The log viewer and the health of the installation are plan 16's, on this same screen.
 */
export function DiagnosticsRoute(): React.JSX.Element {
  const frame = useFramedScreen('diagnostics.screen.title', 'diagnostics.screen.purpose');

  return (
    <ScreenFrame help="diagnostics.help" {...frame}>
      <ConnectionPanel />
      <PingPanel />
    </ScreenFrame>
  );
}
