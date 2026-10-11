import type { EngineCapabilities } from '@domain/engine';
import { EFFORT_LEVELS, PERMISSION_MODES } from '@domain/session';

/**
 * What a session of Claude can do (ADR-025): everything the product offers today — it was built
 * on Claude. Said here, by the adapter, so the core never supposes it.
 */
export const CLAUDE_CAPABILITIES: EngineCapabilities = {
  resume: true,
  fork: 'atMessage',
  history: true,
  images: true,
  promptWhileBusy: true,
  questions: true,
  planApproval: true,
  taskList: true,
  subagents: true,
  thinking: true,
  slashCommands: true,
  modelSwitch: true,
  effortLevels: EFFORT_LEVELS,
  contextUse: true,
  mcp: true,
  compaction: true,
  cost: 'usd',
  // Every canonical mode: each has its translation (`claude-permission-mode.ts`).
  permissionModes: PERMISSION_MODES,
};
