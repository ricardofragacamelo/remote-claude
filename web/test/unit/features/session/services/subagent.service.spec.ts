import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchSubagentPage } from '@/features/session/services/subagent.service';
import { api } from '@/shared/api/api';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reading what a subagent said — plan 08 B-21', () => {
  it('asks for the subagent of a tool of a conversation, by ids it escapes', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ events: [], nextCursor: 'c-2' });

    await expect(fetchSubagentPage({ engine: 'claude', id: 'conv/1' }, 'tool 1')).resolves.toEqual({
      events: [],
      nextCursor: 'c-2',
    });
    expect(get).toHaveBeenCalledWith('/transcripts/claude/conv%2F1/subagents/tool%201/messages');
  });

  it('reads a page with no cursor as the last one', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ events: [], nextCursor: 7 });

    await expect(fetchSubagentPage({ engine: 'claude', id: 'c' }, 't')).resolves.toMatchObject({
      nextCursor: null,
    });
  });

  it('sends the folder it already knows, as a hint — S-163', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ events: [], nextCursor: null });

    await fetchSubagentPage({ engine: 'claude', id: 'c' }, 't', '/srv/projects/app');

    expect(get).toHaveBeenCalledWith(
      '/transcripts/claude/c/subagents/t/messages?workspacePath=%2Fsrv%2Fprojects%2Fapp',
    );
  });
});
