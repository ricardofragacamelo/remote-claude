/**
 * The questions of a recorded `AskUserQuestion` (the `question-turn` fixture of plan 24, B-11), as the
 * server publishes them in `permission.requested.interaction` — three questions: a multiple choice,
 * a single choice with previews (one of them writes HTML), and a single choice with a recommended
 * option.
 */
export const QUESTIONS = [
  {
    id: 'q1',
    header: 'Sections',
    prompt: 'Which sections should the README.md include?',
    multiSelect: true,
    options: [
      { label: 'Installation', description: 'How to install the project.' },
      { label: 'Usage', description: 'Examples of running it.' },
      { label: 'License', description: 'The terms it is under.' },
    ],
  },
  {
    id: 'q2',
    header: 'Format',
    prompt: 'Which format should the README.md follow?',
    multiSelect: false,
    options: [
      {
        label: 'Classic prose',
        description: 'Headings with paragraphs.',
        preview: '# Project Name\n\nA short paragraph.',
      },
      {
        label: 'Badge-heavy landing',
        description: 'Centered title and badges.',
        preview: '<div align="center">\n\n# Badges\n\n</div>',
      },
      { label: 'Plain list', description: 'No preview for this one.' },
    ],
  },
  {
    id: 'q3',
    header: 'Tone',
    prompt: 'What tone should the README.md be written in?',
    multiSelect: false,
    options: [
      { label: 'Professional (Recommended)', description: 'Neutral and concise.' },
      { label: 'Friendly', description: 'Warm and welcoming.' },
    ],
  },
] as const;

/** The `interaction` of a question request — the three above, or what a case puts instead. */
export function anInteraction(
  questions: readonly unknown[] = QUESTIONS,
  malformed = false,
): Record<string, unknown> {
  return { kind: 'question', malformed, questions };
}

/** What a `permission.requested` of `AskUserQuestion` carries beyond the request id. */
export function aQuestionPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    toolUseId: 'toolu-q',
    toolName: 'AskUserQuestion',
    title: 'permission.tool.AskUserQuestion',
    input: { questions: [] },
    riskHint: 'read',
    defaultToNo: false,
    suggestions: [],
    reaches: [],
    interaction: anInteraction(),
    ...overrides,
  };
}
