import { describe, expect, it } from 'vitest';

import {
  askedAbout,
  explanatoryProblems,
  INSIGHT_MARK,
  multiTextProblems,
  RICH_MARKDOWN,
  RICH_MARKDOWN_PROMPT,
  richMarkdownProblems,
  subagentPermissionProblems,
} from '../../../scripts/lib/parity-fixtures.mjs';

/** A message of the main conversation with these blocks. */
const answer = (/** @type {any[]} */ content, /** @type {string | null} */ parent = null) => ({
  type: 'assistant',
  message: { content },
  parent_tool_use_id: parent,
});

const text = (/** @type {string} */ value) => ({ type: 'text', text: value });

describe('the recordings of plan 26 — B-02', () => {
  it('asks for the rich markdown word for word, and finds it whole in an answer that has it', () => {
    expect(RICH_MARKDOWN_PROMPT).toContain(RICH_MARKDOWN);
    expect(richMarkdownProblems([], [answer([text(RICH_MARKDOWN)])])).toEqual([]);
  });

  it('names every node an answer of the rich markdown lacks', () => {
    const problems = richMarkdownProblems(
      [],
      [answer([text('# Parity report')]), { type: 'user' }],
    );

    expect(problems).toContain('the answer lacks ```mermaid');
    expect(problems).toContain('the answer lacks | Client |');
    expect(problems).toHaveLength(8);
  });

  it('reads only the main conversation: a subagent that said it all does not count', () => {
    expect(richMarkdownProblems([], [answer([text(RICH_MARKDOWN)], 'toolu_agent')])).toHaveLength(
      8,
    );
  });

  it('wants text, a tool and text again, thinking aside', () => {
    expect(
      multiTextProblems(
        [],
        [
          answer([{ type: 'thinking' }, text('first')]),
          answer([{ type: 'tool_use' }]),
          answer([{ type: 'thinking' }, text('then')]),
        ],
      ),
    ).toEqual([]);
    expect(multiTextProblems([], [answer([text('only text')])])).toEqual([
      'the answer is not text, a tool and text again',
    ]);
    expect(multiTextProblems([], [answer([{ type: 'tool_use' }, text('after')])])).toHaveLength(1);
    expect(multiTextProblems([], [answer([text('before'), { type: 'tool_use' }])])).toHaveLength(1);
    expect(multiTextProblems([], [answer(/** @type {any} */ ('not blocks'))])).toHaveLength(1);
  });

  it('wants one insight block of the Explanatory style', () => {
    expect(explanatoryProblems([], [answer([text(`${INSIGHT_MARK} ─ why`)])])).toEqual([]);
    expect(explanatoryProblems([], [answer([{ type: 'text' }])])).toEqual([
      `no ${INSIGHT_MARK} block in the answer`,
    ]);
  });

  it('wants canUseTool asked about the tool it names', () => {
    expect(askedAbout('mcp__fixture__echo')([{ toolName: 'mcp__fixture__echo' }])).toEqual([]);
    expect(askedAbout('Write')([{ toolName: 'Read' }])).toEqual([
      'canUseTool was never asked about Write',
    ]);
  });

  it('wants the subagent to say, think and call a tool, and its Write asked about', () => {
    const subagent = [
      answer([text('I will write it.')], 'toolu_agent'),
      answer([{ type: 'thinking' }], 'toolu_agent'),
      answer([{ type: 'tool_use' }], 'toolu_agent'),
      { type: 'user', message: { content: 'a prompt' }, parent_tool_use_id: 'toolu_agent' },
    ];

    expect(subagentPermissionProblems([{ toolName: 'Write' }], subagent)).toEqual([]);
    expect(subagentPermissionProblems([], [answer([text('main')])])).toEqual([
      'canUseTool was never asked about Write',
      'the subagent said no text',
      'the subagent showed no thinking',
      'the subagent called no tool',
    ]);
  });
});
