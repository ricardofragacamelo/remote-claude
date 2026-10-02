import { describe, expect, it } from 'vitest';

import { conversationMarkdown } from '@/features/session/lib/conversation-markdown';
import type { MarkdownLabels } from '@/features/session/lib/conversation-markdown';
import type { StreamMessage, ToolExecution } from '@/features/session/types/live-session';

const labels: MarkdownLabels = {
  title: 'Conversation',
  you: 'You',
  claude: 'Claude',
  thinking: 'Thinking',
  tool: (tool) => `Tool ${tool.toolName}`,
  output: 'Output',
  compacted: 'Compacted',
};

const message = (
  messageId: string,
  role: StreamMessage['role'],
  blocks: StreamMessage['blocks'],
): StreamMessage => ({
  messageId,
  role,
  text: blocks.map((block) => block.text).join(''),
  blocks,
  streaming: null,
  isComplete: true,
  parentToolUseId: null,
  thinkingMs: null,
  thinkingSince: null,
});

const tool = (summary: string | null): ToolExecution => ({
  toolUseId: 't1',
  toolName: 'Bash',
  input: { command: 'echo ```' },
  status: 'succeeded',
  elapsed: null,
  summary,
  parentToolUseId: null,
  taskId: null,
});

const conversation = (summary: string | null) => ({
  messages: [
    message('m1', 'user', [{ kind: 'text', text: 'run it' }]),
    message('m2', 'assistant', [
      { kind: 'thinking', text: 'how?' },
      { kind: 'text', text: 'Done.' },
    ]),
  ],
  tools: [tool(summary)],
  timeline: [
    { kind: 'message', id: 'm1' },
    { kind: 'tool', id: 't1' },
    { kind: 'message', id: 'm2' },
    { kind: 'compacted', id: 'c1', trigger: 'manual', preTokens: 10 },
    { kind: 'turn', id: 'turn-1' },
    { kind: 'message', id: 'gone' },
    { kind: 'tool', id: 'gone' },
  ] as const,
});

describe('the conversation as Markdown — plan 08, B-39', () => {
  it('writes it in order: the messages, the thinking folded, each tool with its exact input — S-180', () => {
    const markdown = conversationMarkdown(conversation('ok'), labels, { outputs: false });

    expect(markdown).toBe(
      [
        '# Conversation',
        '### You\n\nrun it',
        '- Tool Bash\n\n````json\n{\n  "command": "echo ```"\n}\n````',
        '### Claude\n\n<details>\n<summary>Thinking</summary>\n\nhow?\n\n</details>\n\nDone.',
        '> Compacted',
        '---',
      ].join('\n\n') + '\n',
    );
  });

  it('adds the output of a tool only when asked — off by default — S-181', () => {
    const withOutputs = conversationMarkdown(conversation('ok'), labels, { outputs: true });

    expect(withOutputs).toContain('Output\n\n```\nok\n```');
    expect(conversationMarkdown(conversation(null), labels, { outputs: true })).not.toContain(
      'Output',
    );
    expect(conversationMarkdown(conversation(''), labels, { outputs: true })).not.toContain(
      'Output',
    );
  });

  it('is the title alone for a conversation with nothing in it', () => {
    expect(
      conversationMarkdown({ messages: [], tools: [], timeline: [] }, labels, { outputs: false }),
    ).toBe('# Conversation\n');
  });
});
