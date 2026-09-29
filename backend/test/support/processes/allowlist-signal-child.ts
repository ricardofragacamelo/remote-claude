/**
 * A process that holds a workspace allowlist and reloads it on `SIGHUP` — exactly the wiring of
 * the backend, without the rest of it — so a suite can send it a **real** signal from the operating
 * system and watch it survive (plan 06, S-180).
 *
 * Usage: `tsx test/support/processes/allowlist-signal-child.ts <allowlist file>`. It prints `ready`
 * once the listener is in place, and its log lines after that, one JSON object per line.
 */
import { AllowlistReloadSignal } from '@infra/config/allowlist-reload.signal';
import { ReloadableWorkspaceAllowlist } from '@infra/config/reloadable-workspace-allowlist';
import { createRootLogger } from '@shared/logging/logger';

const file = process.argv[2] ?? '';
const logger = createRootLogger({ level: 'info', service: 'backend' });
const signal = new AllowlistReloadSignal(ReloadableWorkspaceAllowlist.load(file, logger), logger);

signal.onApplicationBootstrap();
process.stdout.write('ready\n');

// Held open until the suite ends it: without the listener above, the first SIGHUP would.
setInterval(() => undefined, 60_000);
