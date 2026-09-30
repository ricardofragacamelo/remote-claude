/**
 * Public surface of the `diagnostics` feature — Logs and diagnostics. Plan 16 fills the same screen
 * with the log viewer and the health of the installation.
 */
export { ConnectionPanel } from './components/ConnectionPanel';
export { PingPanel } from './components/PingPanel';
export { usePingStore } from './store/ping.store';
export type { PingRequest, Pong } from './types/ping';
