/**
 * The recordings of plan 26 (B-02): what each one asks of the real Claude, and what it has to hold to
 * be written (docs/plans/26-mobile-conversation-parity/F0-spike.md#b-02).
 *
 * The tests of the app's conversation — its markdown, its blocks, its tool labels, its subagents —
 * are built on these fixtures, and the parity of the two clients is checked against them (B-28). A
 * recording in which the model did not cooperate would prove less than those tests claim, so each one
 * names what it must contain, and the recorder writes nothing when it does not (plan 24, R-04).
 */

/** The answer the markdown recording asks for, word for word — every node the web draws. */
export const RICH_MARKDOWN = [
  '# Parity report',
  '',
  '## What the app draws',
  '',
  '- A list, with a nested one:',
  '  - the first nested item',
  '  - the second nested item',
  '- A second item, with **bold** and *emphasis*',
  '',
  '1. An ordered item',
  '2. Another ordered item',
  '',
  '| Client | Markdown | Code | Diagrams | Diff | Colours | Subagents | Tokens |',
  '|---|---|---|---|---|---|---|---|',
  '| web | a cell long enough to make the table wider than any phone | yes | yes | yes | yes | yes | yes |',
  '| app | the same cells, scrolled sideways inside the box | yes | yes | yes | yes | yes | yes |',
  '',
  '```typescript',
  'export function add(a: number, b: number): number {',
  '  return a + b;',
  '}',
  '```',
  '',
  '```dart',
  'int add(int a, int b) => a + b;',
  '```',
  '',
  '```python',
  'def add(a, b):',
  '    return a + b',
  '```',
  '',
  '> A quotation, with `inline code` in it.',
  '',
  'See [the documentation](https://example.com/docs) and the file `src/app.ts:12`.',
  '',
  '![a remote image](https://example.com/tracker.png)',
  '',
  '<div onclick="alert(1)">raw HTML that stays text</div>',
  '',
  '```mermaid',
  'graph TD',
  '  Web --> App',
  '```',
].join('\n');

/** The prompt that asks for {@link RICH_MARKDOWN}, as the diagram recording of plan 21 asks. */
export const RICH_MARKDOWN_PROMPT =
  'Do not use any tool. Reply with exactly the markdown between the lines START and END, without ' +
  `the lines START and END, and nothing else:\nSTART\n${RICH_MARKDOWN}\nEND`;

/** The text blocks of the main conversation's answers, in order. @param {readonly any[]} messages */
function answerTexts(messages) {
  return messages
    .filter((message) => message?.type === 'assistant' && message.parent_tool_use_id == null)
    .flatMap((message) => (Array.isArray(message.message?.content) ? message.message.content : []))
    .filter((block) => block?.type === 'text')
    .map((block) => String(block.text ?? ''));
}

/** The kinds of the main conversation's blocks, in order. @param {readonly any[]} messages */
function answerKinds(messages) {
  return messages
    .filter((message) => message?.type === 'assistant' && message.parent_tool_use_id == null)
    .flatMap((message) => (Array.isArray(message.message?.content) ? message.message.content : []))
    .map((block) => String(block?.type));
}

/**
 * What the markdown recording lacks: the answer has to carry every node the app draws (S-31).
 *
 * @param {readonly unknown[]} _consulted @param {readonly any[]} messages
 * @returns {string[]}
 */
export function richMarkdownProblems(_consulted, messages) {
  const text = answerTexts(messages).join('\n');
  const wanted = [
    '| Client |',
    '```typescript',
    '```dart',
    '```python',
    '```mermaid',
    '> A quotation',
    '  - the first nested item',
    '<div onclick',
  ];
  return wanted.filter((part) => !text.includes(part)).map((part) => `the answer lacks ${part}`);
}

/**
 * What the recording of several text blocks lacks: text, a tool, then text again, in one answer
 * (S-27, S-30).
 *
 * @param {readonly unknown[]} _consulted @param {readonly any[]} messages
 * @returns {string[]}
 */
export function multiTextProblems(_consulted, messages) {
  const kinds = answerKinds(messages).filter((kind) => kind !== 'thinking');
  const tool = kinds.indexOf('tool_use');
  const before = kinds.slice(0, Math.max(tool, 0)).includes('text');
  const after = tool >= 0 && kinds.slice(tool + 1).includes('text');

  return before && after ? [] : ['the answer is not text, a tool and text again'];
}

/** What a style that explains writes between paragraphs (`Explanatory`). */
export const INSIGHT_MARK = '★ Insight';

/**
 * What the recording of the `Explanatory` style lacks: one of its insight blocks.
 *
 * @param {readonly unknown[]} _consulted @param {readonly any[]} messages
 * @returns {string[]}
 */
export function explanatoryProblems(_consulted, messages) {
  return answerTexts(messages).some((text) => text.includes(INSIGHT_MARK))
    ? []
    : [`no ${INSIGHT_MARK} block in the answer`];
}

/**
 * What a recording lacks when it must have asked about a tool: `canUseTool` consulted about it.
 *
 * @param {string} toolName
 * @returns {(consulted: readonly { toolName: string }[]) => string[]}
 */
export function askedAbout(toolName) {
  return (consulted) =>
    consulted.some((call) => call.toolName === toolName)
      ? []
      : [`canUseTool was never asked about ${toolName}`];
}

/**
 * What the subagent recording lacks: its `Write` asked about, and said by the subagent — never by
 * the main conversation (S-66).
 *
 * @param {readonly { toolName: string }[]} consulted @param {readonly any[]} messages
 * @returns {string[]}
 */
export function subagentPermissionProblems(consulted, messages) {
  const owned = messages.filter((message) => typeof message?.parent_tool_use_id === 'string');
  const kinds = owned.flatMap((message) =>
    Array.isArray(message.message?.content)
      ? message.message.content.map((/** @type {any} */ block) => String(block?.type))
      : [],
  );

  return [
    ...askedAbout('Write')(consulted),
    ...(kinds.includes('text') ? [] : ['the subagent said no text']),
    ...(kinds.includes('thinking') ? [] : ['the subagent showed no thinking']),
    ...(kinds.includes('tool_use') ? [] : ['the subagent called no tool']),
  ];
}
