import type { Conversation, StreamMessage, ToolExecution } from '../types/live-session';

/** The words the markdown is written with — translated by whoever asks, never here. */
export interface MarkdownLabels {
  readonly title: string;
  readonly you: string;
  readonly claude: string;
  readonly thinking: string;
  readonly tool: (tool: ToolExecution) => string;
  readonly output: string;
  readonly compacted: string;
}

/** What goes into the export. */
export interface MarkdownOptions {
  /**
   * The output of each tool. Off by default (D-20): it can carry the contents of a file and a
   * secret the conversation never showed.
   */
  readonly outputs: boolean;
}

/** A fence long enough that no run of backticks inside the text closes it early. */
function fence(text: string): string {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((run) => run[0].length));
  return '`'.repeat(longest + 1);
}

function fenced(text: string, language = ''): string {
  const mark = fence(text);
  return `${mark}${language}\n${text}\n${mark}`;
}

function messageOf(message: StreamMessage, labels: MarkdownLabels): string {
  const blocks = message.blocks.map((block) =>
    block.kind === 'text'
      ? block.text
      : `<details>\n<summary>${labels.thinking}</summary>\n\n${block.text}\n\n</details>`,
  );

  return [`### ${message.role === 'user' ? labels.you : labels.claude}`, ...blocks].join('\n\n');
}

function toolOf(tool: ToolExecution, labels: MarkdownLabels, options: MarkdownOptions): string {
  const parts = [`- ${labels.tool(tool)}`, fenced(JSON.stringify(tool.input, null, 2), 'json')];

  if (options.outputs && tool.summary !== null && tool.summary !== '') {
    parts.push(`${labels.output}\n\n${fenced(tool.summary)}`);
  }

  return parts.join('\n\n');
}

/**
 * The conversation as Markdown, in the order it happened (plan 08, B-39): the messages, the thinking
 * folded, each tool as one line with its exact input — and its output only when asked (D-20).
 * Generated here, from what the screen already reads: nothing the person could not see.
 */
export function conversationMarkdown(
  conversation: Pick<Conversation, 'messages' | 'tools' | 'timeline'>,
  labels: MarkdownLabels,
  options: MarkdownOptions,
): string {
  const sections = conversation.timeline.flatMap((entry): string[] => {
    switch (entry.kind) {
      case 'message': {
        const message = conversation.messages.find((each) => each.messageId === entry.id);
        return message === undefined ? [] : [messageOf(message, labels)];
      }
      case 'tool': {
        const tool = conversation.tools.find((each) => each.toolUseId === entry.id);
        return tool === undefined ? [] : [toolOf(tool, labels, options)];
      }
      case 'compacted':
        return [`> ${labels.compacted}`];
      default:
        return ['---'];
    }
  });

  return [`# ${labels.title}`, ...sections].join('\n\n') + '\n';
}
