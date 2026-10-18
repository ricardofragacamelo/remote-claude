import { describe, expect, it } from 'vitest';

import { agentSettingsHref, readAgentSettingsSearch } from '@/features/agent-settings';

describe("the address of an engine's settings — plan 13, B-09; plan 28, B-38", () => {
  it('reads the section and the folder the link names', () => {
    expect(readAgentSettingsSearch({ section: 'mcp', folder: '/srv/app' })).toEqual({
      section: 'mcp',
      folder: '/srv/app',
    });
  });

  it('keeps a section it does not know itself — the route decides, with the engine in hand', () => {
    expect(readAgentSettingsSearch({ section: 'secrets' })).toEqual({ section: 'secrets' });
    expect(readAgentSettingsSearch({})).toEqual({ section: '' });
    expect(readAgentSettingsSearch({ section: 42 })).toEqual({ section: '' });
  });

  it('drops a folder that is not absolute, or that carries a NUL', () => {
    expect(readAgentSettingsSearch({ section: 'skills', folder: 'relative/path' })).toEqual({
      section: 'skills',
    });
    expect(readAgentSettingsSearch({ section: 'skills', folder: '/srv/\0x' })).toEqual({
      section: 'skills',
    });
  });

  it('builds the link back, folder and all — S-15', () => {
    expect(agentSettingsHref({ engine: 'claude', section: 'project', folder: '/srv/a b' })).toBe(
      '/settings/agents/claude?section=project&folder=%2Fsrv%2Fa+b',
    );
    expect(agentSettingsHref({ engine: 'claude', section: 'account' })).toBe(
      '/settings/agents/claude?section=account',
    );
  });

  it("links to the engine's screen alone when no section is named — the route picks the first one", () => {
    expect(agentSettingsHref({ engine: 'claude' })).toBe('/settings/agents/claude');
    expect(agentSettingsHref({ engine: 'claude', folder: '/srv/app' })).toBe(
      '/settings/agents/claude?folder=%2Fsrv%2Fapp',
    );
  });
});
