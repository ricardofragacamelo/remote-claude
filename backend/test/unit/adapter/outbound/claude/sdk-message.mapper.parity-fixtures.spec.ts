import { describe, expect, it } from 'vitest';
import type { SDKMessage, SessionMessage } from '@anthropic-ai/claude-agent-sdk';

import { historicalEvents, SdkMessageMapper } from '@adapter/outbound/claude/sdk-message.mapper';
import { loadFixture } from '../../../../fakes/agent-sdk/fixture';

/** One event the backend publishes, as the tests read it. */
interface Published {
  readonly type: string;
  readonly payload: Record<string, unknown>;
}

/** What the backend publishes, live, for every message of a recording — in order. */
function published(name: string): Published[] {
  const mapper = new SdkMessageMapper();
  return loadFixture(name).messages.flatMap(
    (message: SDKMessage) => mapper.read(message).events as readonly Published[],
  );
}

/** The blocks of the `message.completed` events of a list, in order. */
function completedBlocks(events: readonly Published[]): Record<string, unknown>[] {
  return events
    .filter((event) => event.type === 'message.completed')
    .flatMap((event) => event.payload['content'] as Record<string, unknown>[]);
}

/** The text the answer's blocks hold, joined as a reader would read them. */
function answerText(events: readonly Published[]): string {
  return completedBlocks(events)
    .filter((block) => block['type'] === 'text')
    .map((block) => String(block['text']))
    .join('\n\n');
}

/** The id of the first call of a tool in a list of events. */
function callOf(events: readonly Published[], toolName: string): Record<string, unknown> {
  const started = events.find(
    (event) => event.type === 'tool.started' && event.payload['toolName'] === toolName,
  );
  return started?.payload ?? {};
}

const PARITY_FIXTURES = [
  'markdown-rich-turn',
  'multi-text-block-turn',
  'explanatory-style-turn',
  'mcp-untitled-tool-turn',
  'subagent-permission-turn',
];

/**
 * The recordings of plan 26 (B-02), read by the backend's mapper: what each one carries for the app's
 * conversation is what the tests of F3…F7 assume it carries (S-06). A re-recording that lost any of
 * it fails here, before a test of the app proves less than it claims.
 */
describe('the recordings of the conversation of the app — plan 26, B-02', () => {
  it.each(PARITY_FIXTURES)('%s is read whole: nothing in it is unknown to the mapper', (name) => {
    const mapper = new SdkMessageMapper();
    const unknown = loadFixture(name)
      .messages.map((message: SDKMessage) => mapper.read(message).unknown)
      .filter((each) => each !== null);

    expect(unknown).toEqual([]);
  });

  it.each(PARITY_FIXTURES)('%s keeps the history the app reloads it from', (name) => {
    expect(loadFixture(name).history?.length ?? 0).toBeGreaterThan(0);
  });

  it('markdown-rich-turn: one answer with every node the web draws — S-31', () => {
    const text = answerText(published('markdown-rich-turn'));

    for (const node of [
      '# Parity report',
      '  - the first nested item',
      '| Client |',
      '> A quotation',
    ]) {
      expect(text).toContain(node);
    }
    for (const fence of ['```typescript', '```dart', '```python', '```mermaid']) {
      expect(text).toContain(fence);
    }
    expect(text).toContain('![a remote image](https://example.com/tracker.png)');
    expect(text).toContain('<div onclick="alert(1)">');
    expect(text).toContain('`src/app.ts:12`');
  });

  it('markdown-rich-turn: the deltas add up to the text that completes — S-33', () => {
    const events = published('markdown-rich-turn');
    const deltas = events
      .filter(
        (event) => event.type === 'message.delta' && event.payload['blockType'] !== 'thinking',
      )
      .map((event) => String(event.payload['delta']))
      .join('');

    expect(deltas).toBe(answerText(events));
  });

  it('multi-text-block-turn: two text blocks of one answer, apart, with the tool between — S-27', () => {
    const events = published('multi-text-block-turn').filter(
      (event) =>
        (event.type === 'message.completed' &&
          (event.payload['content'] as Record<string, unknown>[]).some(
            (block) => block['type'] === 'text',
          )) ||
        event.type === 'tool.started',
    );

    expect(events.map((event) => event.type)).toEqual([
      'message.completed',
      'tool.started',
      'message.completed',
    ]);
    const ids = completedBlocks(events).map((block) => block['blockId']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('explanatory-style-turn: the answer carries the insight blocks of the style', () => {
    expect(answerText(published('explanatory-style-turn'))).toContain('★ Insight');
  });

  it('mcp-untitled-tool-turn: the tool by its raw name, with no title — S-48', () => {
    const started = callOf(published('mcp-untitled-tool-turn'), 'mcp__fixture__echo');

    expect(started['toolName']).toBe('mcp__fixture__echo');
    expect(started['title']).toBeUndefined();
  });

  describe('subagent-permission-turn — S-05, S-63', () => {
    const events = published('subagent-permission-turn');
    const agent = callOf(events, 'Agent');
    const parent = String(agent['toolUseId']);
    const owned = events.filter((event) => event.payload['parentToolUseId'] === parent);

    it('opens a subagent of the project with the Agent tool', () => {
      expect(agent['input']).toEqual(expect.objectContaining({ subagent_type: 'writer' }));
    });

    it('says, thinks and writes only under the Agent call', () => {
      const kinds = completedBlocks(owned).map((block) => block['type']);

      expect(kinds).toEqual(expect.arrayContaining(['text', 'thinking']));
      expect(callOf(owned, 'Write')['parentToolUseId']).toBe(parent);
      expect(callOf(events, 'Write')['parentToolUseId']).toBe(parent);
    });

    it('streams no delta of the subagent: it arrives whole', () => {
      expect(owned.filter((event) => event.type === 'message.delta')).toEqual([]);
    });

    it('asked about the subagent’s Write, by the id of the subagent’s own call', () => {
      const fixture = loadFixture('subagent-permission-turn');
      const write = callOf(owned, 'Write');

      expect(fixture.canUseTool.map((call) => call.toolName)).toEqual(['Write']);
      expect(fixture.preToolUse.map((hook) => hook.toolUseId)).toContain(write['toolUseId']);
    });

    it('keeps the subagent’s history apart, every message of it under the Agent call — S-69', () => {
      const filed = Object.values(loadFixture('subagent-permission-turn').subagents ?? {});
      const [own] = filed;
      const history = (own ?? []).flatMap(
        (message: SessionMessage) => historicalEvents(message) as readonly Published[],
      );

      expect(filed).toHaveLength(1);
      expect(history.length).toBeGreaterThan(0);
      expect(history.every((event) => event.payload['parentToolUseId'] === parent)).toBe(true);
      expect(completedBlocks(history).map((block) => block['type'])).toEqual(
        expect.arrayContaining(['text', 'thinking']),
      );
    });
  });
});
