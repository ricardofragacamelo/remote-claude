import { describe, expect, it } from 'vitest';
import type { SessionMessage } from '@anthropic-ai/claude-agent-sdk';

import { contentsOf } from '@adapter/outbound/claude/transcript-contents';
import { capturedTranscript } from '../../../../fakes/agent-sdk/scripted-transcripts';

/** A transcript entry of a given shape. */
function entry(shape: Record<string, unknown>): SessionMessage {
  return {
    uuid: 'u-1',
    session_id: 's-1',
    parent_tool_use_id: null,
    parent_agent_id: null,
    type: 'user',
    ...shape,
  } as unknown as SessionMessage;
}

describe('the contents of a conversation — plan 22, D-18', () => {
  it('keeps the whole output of each tool, recorded — S-22', () => {
    const { results } = contentsOf(capturedTranscript('bash-output-turn'));
    const [output] = [...results.values()];

    expect(results.size).toBe(1);
    expect(output?.split('\n').filter((line) => line !== '')).toHaveLength(600);
  });

  it('keeps a result made of blocks as their text', () => {
    const { results } = contentsOf([
      entry({
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 't',
              content: [
                { type: 'text', text: 'a' },
                { type: 'text', text: 'b' },
              ],
            },
          ],
        },
      }),
    ]);

    expect(results.get('t')).toBe('ab');
  });

  it('keeps nothing of a subagent — S-28', () => {
    const { results } = contentsOf([
      entry({
        parent_tool_use_id: 'toolu_task',
        message: { content: [{ type: 'tool_result', tool_use_id: 'inner', content: 'x' }] },
      }),
    ]);

    expect(results.size).toBe(0);
  });

  it('keeps each image of a prompt by its marker, and nothing given by URL — S-29, S-19', () => {
    const { images } = contentsOf([
      entry({
        message: {
          content: [
            { type: 'text', text: 'look' },
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
            { type: 'image', source: { type: 'base64', data: 'BBBB' } },
            { type: 'image', source: { type: 'url', url: 'https://x/y.png' } },
            { type: 'image', source: { type: 'base64', media_type: 'image/png' } },
            { type: 'image' },
          ],
        },
      }),
    ]);

    expect([...images]).toEqual([
      ['u-1:1', { mediaType: 'image/png', data: 'AAAA' }],
      ['u-1:2', { mediaType: null, data: 'BBBB' }],
    ]);
  });

  it('reads nothing from an answer, a prompt that is a string, or an entry with no message', () => {
    const contents = contentsOf([
      entry({
        type: 'assistant',
        message: { content: [{ type: 'tool_result', tool_use_id: 'a' }] },
      }),
      entry({ message: { content: 'just text' } }),
      entry({ message: null }),
      entry({ message: { content: [{ type: 'tool_result', content: 'no id' }] } }),
    ]);

    expect(contents.results.size).toBe(0);
    expect(contents.images.size).toBe(0);
  });
});
