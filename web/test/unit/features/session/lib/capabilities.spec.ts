import { describe, expect, it } from 'vitest';

import { canDo, capabilitiesIn, ifCan } from '@/features/session/lib/capabilities';
import type { EngineDirectory } from '@/features/session/types/engine';
import {
  CAPABILITIES,
  FEWER_CAPABILITIES,
  OTHER_ENGINE,
  OTHER_ENGINE_NAME,
} from '../../../../support/engines';

const DIRECTORY: EngineDirectory = {
  defaultEngine: 'claude',
  engines: [
    {
      id: 'claude',
      displayName: 'Claude',
      state: 'available',
      reason: null,
      version: '2.1.0',
      capabilities: CAPABILITIES,
    },
    {
      id: OTHER_ENGINE,
      displayName: OTHER_ENGINE_NAME,
      state: 'available',
      reason: null,
      version: null,
      capabilities: { ...FEWER_CAPABILITIES, taskList: false },
    },
  ],
};

/** What a control exists by — plan 28, F3. */
describe('the capabilities of an engine', () => {
  it('lets a control be for an engine that has it — S-68, S-70, S-72', () => {
    expect(canDo(CAPABILITIES, 'taskList')).toBe(true);
    expect(canDo(CAPABILITIES, 'compaction')).toBe(true);
  });

  it('takes the control away from an engine that said it has not — S-68, S-70, S-72', () => {
    expect(canDo({ ...CAPABILITIES, taskList: false }, 'taskList')).toBe(false);
    expect(canDo({ ...CAPABILITIES, compaction: false }, 'compaction')).toBe(false);
    expect(canDo({ ...CAPABILITIES, contextUse: false }, 'contextUse')).toBe(false);
  });

  it('keeps the control while what the engine can do is not known — the server refuses then', () => {
    expect(canDo(null, 'taskList')).toBe(true);
  });

  it('gives what a control draws only for an engine that can', () => {
    expect(ifCan(CAPABILITIES, 'taskList', 'list')).toBe('list');
    expect(ifCan({ ...CAPABILITIES, taskList: false }, 'taskList', 'list')).toBeNull();
  });

  it('reads what an engine can do from the directory, by its id', () => {
    expect(capabilitiesIn(DIRECTORY, OTHER_ENGINE)?.taskList).toBe(false);
    expect(capabilitiesIn(DIRECTORY, 'claude')).toBe(CAPABILITIES);
  });

  it('reads the default engine’s for a conversation that names none', () => {
    expect(capabilitiesIn(DIRECTORY, null)).toBe(CAPABILITIES);
  });

  it('knows nothing of an engine the directory does not list, nor before the directory', () => {
    expect(capabilitiesIn(DIRECTORY, 'unknown')).toBeNull();
    expect(capabilitiesIn(null, 'claude')).toBeNull();
    expect(capabilitiesIn(null, null)).toBeNull();
  });
});
