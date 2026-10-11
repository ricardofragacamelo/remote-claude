import { describe, expect, it } from 'vitest';

import { FORMER_PANEL_RESTORER_ID, formerCommandIdsOf } from '@/features/session/lib/former-ids';
import { AGENT_PANEL_RESTORER } from '@/features/session/store/agent-panel-restorer';

describe('the ids the agent’s panel had before plan 28 — B-39, S-112', () => {
  it('reads a command of the panel by the id it had, and none for one never renamed', () => {
    expect(formerCommandIdsOf('agent.focusComposer')).toEqual(['claude.focusComposer']);
    expect(formerCommandIdsOf('agent.previousConversation')).toEqual([
      'claude.previousConversation',
    ]);
    expect(formerCommandIdsOf('session.showChanges')).toEqual([]);
  });

  it('gives a kept folder tab the panel it kept under the id the panel had', () => {
    expect(FORMER_PANEL_RESTORER_ID).toBe('session.claudePanel');
    expect(AGENT_PANEL_RESTORER.id).toBe('session.agentPanel');
    expect(AGENT_PANEL_RESTORER.formerIds).toEqual([FORMER_PANEL_RESTORER_ID]);
  });
});
