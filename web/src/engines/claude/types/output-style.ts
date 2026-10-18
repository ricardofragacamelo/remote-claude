import type { OutputStyleViewPayloadFolder } from '@remote-claude/contracts';

import type { EffectiveValue } from '@/features/agent-settings';

/**
 * The output style as the screen shows it: what applies, the user's own, and the folder's
 * (`GET/PUT /engines/claude/output-style` and friends).
 */
export interface OutputStyleView {
  readonly effective: EffectiveValue;
  readonly user: string | null;
  readonly folder: OutputStyleViewPayloadFolder | null;
}
