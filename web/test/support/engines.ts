import type { EngineCapabilities } from '@remote-claude/contracts';

/**
 * The engines as `GET /engines` and `session.started` describe them, for the specs that read them
 * (plan 28, B-13). The second engine is there to prove the screens name an engine by what the server
 * says — never by a name they know.
 */

/** Everything an engine can do, as the one the specs run on declares it. */
export const CAPABILITIES: EngineCapabilities = {
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
  effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
  contextUse: true,
  mcp: true,
  compaction: true,
  cost: 'usd',
  permissionModes: ['ask', 'acceptEdits', 'readOnly', 'allowAll'],
};

/** An engine with less: what a second, smaller agent would declare. */
export const FEWER_CAPABILITIES: EngineCapabilities = {
  ...CAPABILITIES,
  fork: 'none',
  images: false,
  subagents: false,
  cost: 'none',
  effortLevels: [],
  permissionModes: ['ask'],
};

/** The other engine of the specs, and how a screen names it. */
export const OTHER_ENGINE = 'other';
export const OTHER_ENGINE_NAME = 'Other Agent';

/** One engine as `GET /engines` lists it. */
export function anEngineDto(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'claude',
    displayName: 'Claude',
    state: 'available',
    reason: null,
    version: '2.1.0',
    capabilities: CAPABILITIES,
    ...overrides,
  };
}

/** What `GET /engines` answers: the default first, then the other engine of the specs. */
export function anEngineList(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    defaultEngine: 'claude',
    engines: [
      anEngineDto(),
      anEngineDto({
        id: OTHER_ENGINE,
        displayName: OTHER_ENGINE_NAME,
        state: 'unavailable',
        reason: 'engine.error.notInstalled',
        version: null,
        capabilities: FEWER_CAPABILITIES,
      }),
    ],
    ...overrides,
  };
}

/**
 * The `other` route of the fake API of the workbench that answers `GET /engines` — what a draft and
 * a screen with no session read the modes and the levels of effort from (plan 28, B-27, B-28).
 */
export function listedEngines(path: string): Record<string, unknown> | undefined {
  return path === '/engines' ? anEngineList() : undefined;
}
