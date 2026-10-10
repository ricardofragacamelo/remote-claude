#!/usr/bin/env node
/**
 * Records the Agent SDK's real output as fixtures.
 *
 * The fake in `backend/test/fakes/agent-sdk/` replays these files. It exists because without a
 * deterministic stream there is no integration test, no e2e and no honest coverage of
 * `adapter/outbound/claude/` — and because a fake written from memory proves only that the fake
 * works, which is exactly the risk this tool removes
 * (docs/plans/01-live-session/decisions.md#d-04).
 *
 * It runs **on demand**, like the live smoke test: it needs the Claude CLI logged in on this
 * machine, it spends quota, and it talks to the network. It is not a gate.
 *
 * Every run happens in a throwaway directory under the system temp, never in this repository:
 * the scenarios ask Claude to write files, and a scenario that wrote into the working tree would
 * be a recording tool with a side effect nobody asked for.
 *
 * Two kinds of recording. A **turn** sends one prompt and keeps everything the stream, the hooks and
 * `canUseTool` produced. The **catalogue** sends no prompt at all: it opens the `query()`, asks
 * `supportedCommands()` and closes — which costs no quota, because nothing is ever said to the model.
 *
 * Usage:
 *   pnpm fixtures:record               # every scenario
 *   pnpm fixtures:record text-turn     # one of them, by name
 *   pnpm fixtures:record --normalise   # re-apply the normalisation to what is committed, no SDK
 *   pnpm fixtures:record --history queue-turn   # add what the SDK reads back of a recorded run
 */

import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import * as prettier from 'prettier';

import {
  QUESTION_TOOL,
  answeredWithFirstOptions,
  planTurnProblems,
  questionTurnProblems,
} from './lib/fixture-questions.mjs';
import {
  MCP_SERVER,
  PROMPTS as SPIKE_PROMPTS,
  repositoryFiles as subagentRepository,
} from './lib/conversation-parity-spike.mjs';
import {
  askedAbout,
  explanatoryProblems,
  multiTextProblems,
  RICH_MARKDOWN_PROMPT,
  richMarkdownProblems,
  subagentPermissionProblems,
} from './lib/parity-fixtures.mjs';
import { withoutParentSession } from './lib/parent-session.mjs';
import { repoRoot } from './lib/paths.mjs';
import { bold, dim, fail, info, ok, title, warn } from './lib/ui.mjs';

/** Where the fake reads them from. */
const FIXTURES_DIR = path.join(repoRoot, 'backend', 'test', 'fakes', 'agent-sdk', 'fixtures');

/** How long one scenario may take before it is abandoned. A turn with tools is not fast. */
const SCENARIO_TIMEOUT_MS = 240_000;

/** A 16×16 red PNG — the image the D-02 spike asks the colour of. */
const RED_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGO4I2JDEmIY1TCqYfhqAAAeBCwQ8YdREQAAAABJRU5ErkJggg==';

/** How long a run whose prompts are all in waits for a turn that may never come (D-14). */
const QUIET_MS = 20_000;

/** The machine's environment, without what a parent Claude Code session put in it (§10.0). */
function recordingEnvironment() {
  return withoutParentSession(process.env);
}

/** How often the transcript of a scenario that watches it is looked at. */
const TRANSCRIPT_POLL_MS = 250;

/**
 * One recording: a prompt — or several, as steps — against a throwaway workspace.
 *
 * @typedef {object} Scenario
 * @property {string} name
 * @property {string} why
 * @property {string} [prompt] one prompt, one turn
 * @property {(string | Step)[]} [prompts] several, one turn each — see {@link stepsOf}
 * @property {Record<string, string>} files what the workspace is seeded with
 * @property {Record<string, unknown>} [options] options of the query beyond the product's own
 * @property {Record<string, string>} [env] variables added to the {@link recordingEnvironment} —
 *   only these are written to the fixture, never the machine's own
 * @property {boolean} [watchTranscript] measure how long the transcript goes unwritten
 * @property {number} [quietMs] how long to wait, once every prompt is in, for a result that may
 *   never come — longer than {@link QUIET_MS} for a turn that is slow by nature, like `/compact`
 * @property {(consulted: { toolName: string, input: unknown }[], messages: unknown[]) => string[]} [requires]
 *   what the recording has to hold for the tests built on it — a fixture missing any of it is not
 *   written, and the run fails, rather than proving less than those tests claim (plan 24, R-04)
 * @property {boolean} [subagentHistory] read back, besides the conversation, what each of its
 *   subagents said — the history a subagent's card loads (plan 26, B-20)
 */

/**
 * What gets recorded.
 *
 * Each one exists for a claim the fake has to be able to support. `files` seeds the throwaway
 * workspace so the prompt has something real to act on.
 *
 * @type {Scenario[]}
 */
const SCENARIOS = [
  {
    name: 'text-turn',
    why: 'the plainest turn there is: deltas, one completed message, one result',
    prompt: 'Reply with exactly the word: pong. Do not use any tool.',
    files: {},
  },
  {
    name: 'tool-turn',
    why: 'the 6 tool calls → 6 PreToolUse hooks → 2 canUseTool asymmetry the audit trail rests on',
    prompt:
      'Read notes.md, then run `ls` in this directory, then read notes.md again, ' +
      'then write a file called summary.md containing one line summarising notes.md. ' +
      'Work through it step by step and do not ask me anything.',
    files: { 'notes.md': 'The project has two goals: be safe, and be fast.\n' },
  },
  {
    name: 'init-turn',
    why: '`/init` sent as a prompt runs the command, and its `Write` asks through canUseTool',
    prompt: '/init',
    files: {
      'README.md': '# Tally\n\nCounts words in a file.\n',
      'tally.js':
        "const fs = require('fs');\nconsole.log(fs.readFileSync(process.argv[2], 'utf8').split(/\\s+/).length);\n",
    },
  },
  {
    name: 'cwd-turn',
    why: 'Claude names the directory it runs in — what proves, through the door a person uses, that a session runs in the folder of its tab (plan 06, S-156)',
    prompt:
      'Reply with only the absolute path of your current working directory, on one line, ' +
      'and nothing else. Do not use any tool.',
    files: {},
  },

  // Plan 08, B-06 — the turns the Claude panel draws, and the spikes of its F0 (D-01, D-02, D-06,
  // D-14, D-15, D-16), which are measured on the same recordings.
  {
    name: 'edit-turn',
    why: 'Edit twice on one file in one turn, Write over an existing file and Write of a new one — what the diffs of plan 08 (F3) are computed from',
    prompt:
      "Use the Edit tool to change 'hello' to 'hi' in app.js. Then use the Edit tool again on " +
      'app.js to change console.log to console.info. Then use the Write tool to overwrite ' +
      'config.json with exactly {"debug": true} and a newline. Then use the Write tool to create ' +
      'notes.txt containing the single line: done. Use no other tool and do not ask me anything.',
    files: {
      'app.js': "const greeting = 'hello';\nconsole.log(greeting);\n",
      'config.json': '{"debug": false}\n',
    },
  },
  {
    name: 'reference-turn',
    why: 'D-01 — a reference in the delimited form the backend composes: Claude reads it through Read, under PreToolUse',
    prompt:
      'Summarise the referenced file in one line.\n\n<reference path="notes.md" lines="1-2" />',
    files: { 'notes.md': 'Line one says the build is green.\nLine two says the docs are late.\n' },
  },
  {
    name: 'mention-turn',
    why: 'D-01 — `@path` as the CLI spells a mention: whether the CLI expands it inline, with no Read under PreToolUse',
    prompt: 'Summarise @notes.md in one line.',
    files: { 'notes.md': 'Line one says the build is green.\nLine two says the docs are late.\n' },
  },
  {
    name: 'task-subagent-turn',
    why: 'D-15 — a subagent with forwardSubagentText: its text, thinking and tools carry parent_tool_use_id, and how many events one costs',
    prompt:
      'Use the Agent tool with the general-purpose subagent, not in the background, to read ' +
      'notes.md and report its first line. Do not read the file yourself. Then repeat what the ' +
      'subagent reported, in one line.',
    files: { 'notes.md': 'The first line is about apples.\nThe second is about pears.\n' },
    options: { forwardSubagentText: true },
  },
  {
    name: 'todo-turn',
    why: 'the task list the panel pins on top: the whole list on every TodoWrite, updated twice',
    prompt:
      'Use the TodoWrite tool to record a list of three steps: write a.txt, write b.txt, write ' +
      'c.txt. Then mark the first one in progress with TodoWrite, write a.txt containing the ' +
      'letter a with the Write tool, and mark it completed with TodoWrite. Stop there and do not ' +
      'ask me anything.',
    files: {},
  },
  {
    name: 'todo-enabled-turn',
    why: 'the task list with `todoFeatureEnabled`, which the SDK leaves off: what tool keeps the list, and its input',
    prompt:
      'Keep a task list with your todo tool: three steps — write a.txt, write b.txt, write c.txt. ' +
      'Mark the first in progress, write a.txt containing the letter a with the Write tool, then ' +
      'mark it completed. Stop there and do not ask me anything.',
    files: {},
    options: { settings: { todoFeatureEnabled: true } },
  },
  {
    name: 'task-tools-turn',
    why: 'D-25 — the task tools the CLI 2.1.268+ withholds from models outside its list unless `CLAUDE_CODE_ENABLE_TODO_TOOLS` opts in: TaskCreate and TaskUpdate, one call per change',
    prompt:
      'Keep a task list with your task tools: three steps — write a.txt, write b.txt, write c.txt. ' +
      'Mark the first in progress, write a.txt containing the letter a with the Write tool, then ' +
      'mark it completed. Stop there and do not ask me anything.',
    files: {},
    env: { CLAUDE_CODE_ENABLE_TODO_TOOLS: '1' },
  },
  {
    name: 'todo-write-turn',
    why: 'D-25 — the same opt-in with `CLAUDE_CODE_ENABLE_TASKS` off, which swaps the task tools for the legacy TodoWrite: the whole list on every call',
    prompt:
      'Use the TodoWrite tool to record a list of three steps: write a.txt, write b.txt, write ' +
      'c.txt. Then mark the first one in progress with TodoWrite, write a.txt containing the ' +
      'letter a with the Write tool, and mark it completed with TodoWrite. Stop there and do not ' +
      'ask me anything.',
    files: {},
    env: { CLAUDE_CODE_ENABLE_TODO_TOOLS: '1', CLAUDE_CODE_ENABLE_TASKS: '0' },
  },
  {
    name: 'task-tools-listed-model-turn',
    why: 'D-25 — a model inside the CLI list, with no variable: whether the model picks TodoWrite or the task tools, or only whether there is a list at all',
    prompt:
      'Keep a task list with your task tools: three steps — write a.txt, write b.txt, write c.txt. ' +
      'Mark the first in progress, write a.txt containing the letter a with the Write tool, then ' +
      'mark it completed. Stop there and do not ask me anything.',
    files: {},
    options: { model: 'claude-haiku-4-5' },
  },
  {
    name: 'thinking-summarized-turn',
    why: 'D-17 — thinking with `display: summarized`, which the installation omits by default: what text the blocks carry',
    prompt:
      'Think it through step by step before answering: a train leaves at 14:35 and the trip takes ' +
      '2 hours 47 minutes. At what time does it arrive? Reply with only the time.',
    files: {},
    options: { thinking: { type: 'adaptive', display: 'summarized' } },
  },
  {
    name: 'thinking-other-model-turn',
    why: 'D-17 — the same summarized thinking asked of a model older than adaptive thinking: whether the option is harmless there',
    prompt: 'Reply with exactly the word: pong. Do not use any tool.',
    files: {},
    options: { model: 'claude-haiku-4-5', thinking: { type: 'adaptive', display: 'summarized' } },
  },
  {
    name: 'plan-turn',
    why: 'B-22 — in plan mode, ExitPlanMode reaches canUseTool with the plan in its input',
    prompt:
      'Plan how you would add a README.md that describes this project in two lines. Do not write ' +
      'anything yet. When the plan is ready, present it to me with ExitPlanMode.',
    files: { 'index.js': "console.log('tally');\n" },
    options: { permissionMode: 'plan' },
    // The panel's e2e answers the question first and the plan second (plan 24, B-23).
    requires: planTurnProblems,
  },
  {
    name: 'question-turn',
    why: 'plan 24, B-11 — AskUserQuestion with several questions, one of multiple choice and one with previews, answered',
    prompt:
      'Before doing anything else, use the AskUserQuestion tool once, with three questions in that ' +
      'single call, about a README.md for this project: (1) which sections it should have, as a ' +
      'multiple choice (multiSelect: true) with options such as Usage, Installation and License; ' +
      '(2) its format, as a single choice in which every option carries a `preview` with a short ' +
      'markdown sample of that format; (3) its tone, as a single choice. Once I have answered, ' +
      'reply with one sentence that repeats my answers, and use no other tool.',
    files: { 'index.js': "console.log('tally');\n" },
    requires: questionTurnProblems,
  },
  {
    name: 'thinking-turn',
    why: 'D-17 — what thinking the model of the installation returns by default: blocks, deltas, redaction',
    prompt:
      'Think it through step by step before answering: a train leaves at 14:35 and the trip takes ' +
      '2 hours 47 minutes. At what time does it arrive? Reply with only the time.',
    files: {},
  },
  {
    name: 'compact-turn',
    why: '`/compact` after a turn: the compact_boundary that becomes session.compacted',
    prompts: ['Reply with exactly the word: one. Do not use any tool.', '/compact'],
    files: {},
    quietMs: 150_000,
  },
  {
    name: 'image-turn',
    why: 'D-02 — an image block in the SDKUserMessage of the streaming input: whether the CLI takes it',
    prompts: [
      {
        content: [
          {
            type: 'text',
            text: 'What is the dominant colour of this image? Reply with one lowercase word.',
          },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: RED_PNG } },
        ],
      },
    ],
    files: {},
  },
  {
    name: 'effort-turn',
    why: 'D-16 — applyFlagSettings({ effortLevel }) between two turns of a live session, read off the effort the PreToolUse hook reports',
    prompts: [
      'Run `ls` with the Bash tool, then reply with exactly: ok.',
      { text: 'Run `pwd` with the Bash tool, then reply with exactly: ok.', before: 'effortLow' },
    ],
    files: { 'a.txt': 'a\n' },
  },
  {
    name: 'queue-turn',
    why: 'D-14 — a prompt pushed while a turn runs: whether the SDK folds it into that turn or runs it as its own',
    prompts: [
      'Run `sleep 6` with the Bash tool, then reply with exactly: first.',
      { text: 'Reply with exactly the word: second.', when: 'midTurn' },
    ],
    files: {},
  },
  {
    name: 'stamped-turn',
    why: 'plan 08, F6 — the prompt streamed with a uuid, as the backend streams it: the CLI answers with `command_lifecycle` frames the typed union of the SDK does not name',
    prompts: [{ text: 'Reply with exactly the word: pong. Do not use any tool.', stamped: true }],
    files: {},
  },
  {
    name: 'long-tool-turn',
    why: 'D-06 — how long a transcript goes unwritten while one tool runs: the window of "active elsewhere"',
    prompt:
      'Run exactly this command with the Bash tool, in the foreground and not in the background: ' +
      'node -e "setTimeout(() => console.log(\'waited\'), 40000)". Then reply with exactly: done.',
    files: {},
    watchTranscript: true,
  },
  {
    name: 'diagram-turn',
    why: 'plan 21, D-15 — an answer with a table and a closed mermaid block: the diagram drawn in the chat once the message is complete',
    prompt:
      'Do not use any tool. Reply with exactly the markdown between the lines START and END, ' +
      'without the lines START and END, and nothing else:\n' +
      'START\n' +
      'Here is the flow.\n\n' +
      '| Step | What happens |\n' +
      '|---|---|\n' +
      '| 1 | a question arrives |\n' +
      '| 2 | an answer leaves |\n\n' +
      '```mermaid\n' +
      'graph TD\n' +
      '  Question --> Answer\n' +
      '```\n' +
      'END',
    files: {},
  },
  {
    name: 'bash-output-turn',
    why: 'plan 22, B-05 — a Bash call with its `description` and an output of several hundred lines: the title of the tool, and a summary that keeps the end',
    prompt:
      'Run exactly this command with the Bash tool, in the foreground: seq 1 600. ' +
      'Then reply with exactly: done.',
    files: {},
  },

  // Plan 26, B-02 — the conversation the app draws as the web does: markdown, blocks in order, the
  // label of an MCP tool, the insight blocks of a style, and a subagent nested with its permission.
  {
    name: 'markdown-rich-turn',
    why: 'plan 26, B-02 — every node of markdown the web draws in an answer: headings, nested lists, a wide table, code in three languages, a quotation, a link, a remote image, raw HTML and a mermaid block',
    prompt: RICH_MARKDOWN_PROMPT,
    files: {},
    requires: richMarkdownProblems,
  },
  {
    name: 'multi-text-block-turn',
    why: 'plan 26, B-02 — one answer of text, a tool and text again: the text blocks arrive apart, and the app keeps them apart and in order',
    prompt: SPIKE_PROMPTS.blocks,
    files: { 'notes.md': 'A file to list.\n' },
    requires: multiTextProblems,
  },
  {
    name: 'explanatory-style-turn',
    why: 'plan 26, B-02 — an answer in the Explanatory output style, whose insight blocks are the formatting plan 13 makes common',
    prompt:
      'Read notes.md with the Read tool and use no other tool, then explain in two short ' +
      'paragraphs what this project is for.',
    files: { 'notes.md': 'Tally counts the words of a file, and prints the count.\n' },
    options: { settings: { outputStyle: 'Explanatory' } },
    requires: explanatoryProblems,
  },
  {
    name: 'mcp-untitled-tool-turn',
    why: 'plan 26, B-02 — a tool of an MCP server called with no title: the name the CLI gives it, which the app labels `fixture · echo`',
    prompt: SPIKE_PROMPTS.mcp,
    files: {},
    options: {
      strictMcpConfig: true,
      mcpServers: {
        [MCP_SERVER]: {
          type: 'stdio',
          command: 'node',
          args: [
            path.join(repoRoot, 'e2e', 'fixtures', 'mcp-server', 'fixture-mcp-server.mjs'),
            '--name',
            MCP_SERVER,
          ],
        },
      },
    },
    requires: askedAbout(`mcp__${MCP_SERVER}__echo`),
  },
  {
    name: 'subagent-permission-turn',
    why: 'plan 26, B-02 — a subagent of the project that thinks, says, and writes a file asking for it: everything it emits carries parent_tool_use_id, and its history lives apart',
    prompt: SPIKE_PROMPTS.subagent,
    files: subagentRepository(),
    // On `haiku`, as the spike measured it: the default model often delegates without thinking, and
    // the fixture has to carry a subagent's thinking (S-66).
    options: {
      model: 'haiku',
      forwardSubagentText: true,
      thinking: { type: 'adaptive', display: 'summarized' },
    },
    requires: subagentPermissionProblems,
    subagentHistory: true,
  },
];

/**
 * What the catalogue recording asks for: the commands of the installation, with no prompt.
 *
 * The same `settingSources` the product runs with — the list depends on it (54 commands with
 * `['project']`, 57 with the default, measured), and a fixture taken under different settings would
 * be a list of some other installation.
 */
const CATALOGUE = {
  name: 'commands',
  why: 'what supportedCommands() answers, dead and internal entries included — the menu filters them by metadata; with a skill of the project, which the menu badges as such (plan 08, S-259)',
  // A skill of the project, in the place the CLI reads it with `settingSources: ['project']`: what
  // the menu of `/` shows as the project's, and what the e2e chooses to fire (plan 08, B-54).
  files: {
    '.claude/skills/release-notes/SKILL.md':
      '---\n' +
      'name: release-notes\n' +
      'description: Summarise what changed in this project since the last release, in three bullets.\n' +
      '---\n\n' +
      'Read what changed since the last tag and write three bullets for the release notes.\n',
  },
};

/**
 * What the installation recording asks for — the models, the MCP servers and the use of the context
 * window of an idle session (plan 08, B-36…B-38). Like the catalogue, it says nothing to the model:
 * three control requests, answered from the initialisation of the subprocess.
 */
const INITIALIZATION = {
  name: 'initialization',
  why: 'what initializationResult(), accountInfo(), supportedAgents() and reloadSkills() answer before the first prompt — the catalogue of plan 13 (B-10), one question for the models, agents, output styles and account; the account is replaced by an example, never recorded',
};

/** What the account of a recording says instead of the account of whoever recorded it. */
const EXAMPLE_ACCOUNT = { email: 'person@example.com', organization: 'Example Organization' };

/**
 * The account, with who it is replaced by the example: the fields that name a person or an
 * organization are never written to a fixture; the rest — the plan, the provider, the names of the
 * credential's sources — is what the tests read.
 *
 * @param {Record<string, unknown> | undefined} account
 */
function exampleAccount(account) {
  return Object.fromEntries(
    Object.entries(account ?? {}).map(([key, value]) => [
      key,
      key in EXAMPLE_ACCOUNT
        ? EXAMPLE_ACCOUNT[/** @type {keyof typeof EXAMPLE_ACCOUNT} */ (key)]
        : value,
    ]),
  );
}

const INSTALLATION = {
  name: 'installation',
  why: 'what supportedModels(), mcpServerStatus() and getContextUsage({ detail: "summary" }) answer before the first prompt — the selectors and the meter of the panel',
};

/**
 * Writes a fixture the way `pnpm format:check` expects it.
 *
 * `JSON.stringify` expands every array, and Prettier folds the short ones back onto one line — a
 * fixture written raw fails gate 1 the moment it is recorded again.
 *
 * @param {string} file
 * @param {unknown} fixture
 */
async function writeFixture(file, fixture) {
  const options = (await prettier.resolveConfig(file)) ?? {};
  const text = await prettier.format(JSON.stringify(fixture), { ...options, filepath: file });

  fs.writeFileSync(file, text, 'utf8');
}

/** @param {string} message */
function abort(message) {
  fail(message);
  process.exit(1);
}

/**
 * A throwaway workspace, seeded with the scenario's files.
 *
 * @param {Record<string, string>} files
 * @returns {string}
 */
function makeWorkspace(files) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-fixture-'));

  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(directory, name)), { recursive: true });
    fs.writeFileSync(path.join(directory, name), content, 'utf8');
  }

  return directory;
}

/**
 * The prompts of a scenario, each as a step: what to send, and when.
 *
 * A step is a string, or `{ text | content, before?, when?, stamped? }`: `content` is a list of blocks of the
 * Messages API (the image of D-02); `before` names an action run on the live query just before the
 * step is sent (`effortLow`, for D-16); `when: 'midTurn'` sends it while the previous turn is still
 * running — as soon as that turn announces its first tool — instead of after its result (D-14);
 * `stamped` sends it with a uuid of its own, as the backend does (plan 08, F6).
 *
 * @typedef {{ text?: string, content?: unknown[], before?: string, when?: 'midTurn', stamped?: boolean }} Step
 * @param {Scenario} scenario
 * @returns {Step[]}
 */
function stepsOf(scenario) {
  const declared = scenario.prompts ?? [String(scenario.prompt)];

  return declared.map((step) => (typeof step === 'string' ? { text: step } : step));
}

/**
 * What a step sends, as the streaming input carries a user message.
 *
 * @param {Step} step
 */
function userMessage(step) {
  return {
    type: 'user',
    message: { role: 'user', content: step.content ?? step.text ?? '' },
    parent_tool_use_id: null,
    // With the uuid the backend streams every prompt with since plan 08, F6 — what the CLI files
    // the prompt under, and what it answers `command_lifecycle` frames about.
    ...(step.stamped === true ? { uuid: randomUUID() } : {}),
  };
}

/** Actions a step can ask for on the live query before it is sent. */
const BEFORE = {
  /** @param {{ applyFlagSettings(settings: unknown): Promise<void> }} session */
  effortLow: (session) => session.applyFlagSettings({ effortLevel: 'low' }),
};

/**
 * A promise and the function that settles it, for the input to wait on what the stream says.
 *
 * @returns {{ promise: Promise<void>, settle: () => void }}
 */
function signal() {
  /** @type {() => void} */
  let settle = () => undefined;
  const promise = new Promise((resolve) => {
    settle = () => resolve(undefined);
  });

  return { promise, settle };
}

/**
 * When the transcript of a run was written, polled while the run lasts: the longest silence is the
 * measure D-06 asks for. The file is the CLI's own — `<config>/projects/<slug>/<session>.jsonl` —
 * and is only ever `stat`ed, never read.
 *
 * @param {() => string | null} sessionId the id the CLI reported, once it has
 * @param {string} workspace
 */
function watchTranscript(sessionId, workspace) {
  /** @type {number[]} */
  const writes = [];
  const timer = setInterval(() => {
    const id = sessionId();
    if (id === null) {
      return;
    }
    const file = path.join(os.homedir(), '.claude', 'projects', slugOf(workspace), `${id}.jsonl`);
    try {
      const written = fs.statSync(file).mtimeMs;
      if (writes.at(-1) !== written) {
        writes.push(written);
      }
    } catch {
      // Not written yet.
    }
  }, TRANSCRIPT_POLL_MS);

  return {
    stop() {
      clearInterval(timer);
      const gaps = writes.slice(1).map((at, index) => at - Number(writes[index]));
      return { writes: writes.length, longestSilenceMs: Math.round(Math.max(0, ...gaps)) };
    },
  };
}

/**
 * What a run has seen so far, and the signals its input waits on.
 *
 * @param {Step[]} steps
 */
function runState(steps) {
  return {
    /** @type {string | null} */
    claudeSessionId: null,
    results: steps.map(() => signal()),
    firstTool: steps.map(() => signal()),
    turn: 0,
    resultsSeen: 0,
    /** How many steps the input has handed to the SDK. */
    sent: 0,
    /** Set when the run was closed for having gone quiet, which ends the stream on purpose. */
    quiet: false,
  };
}

/**
 * Takes note of one message of the stream: the conversation's id, the first tool of the running
 * turn, a turn's result. Answers whether every turn of the scenario has ended.
 *
 * @param {unknown} message
 * @param {ReturnType<typeof runState>} state
 * @param {number} turns
 * @returns {boolean}
 */
function observe(message, state, turns) {
  const kind =
    /** @type {{ type?: string, session_id?: unknown, message?: { content?: unknown } }} */ (
      message
    );

  if (state.claudeSessionId === null && typeof kind.session_id === 'string') {
    state.claudeSessionId = kind.session_id;
  }
  if (kind.type === 'assistant' && hasToolUse(kind.message?.content)) {
    state.firstTool[state.turn]?.settle();
  }
  if (kind.type !== 'result') {
    return false;
  }
  state.results[state.resultsSeen]?.settle();
  state.resultsSeen += 1;

  return state.resultsSeen >= turns;
}

/** @param {unknown} content @returns {boolean} */
function hasToolUse(content) {
  return Array.isArray(content) && content.some((block) => block?.type === 'tool_use');
}

/**
 * The prompts of a run as the streaming input the SDK pulls from, each sent when its step says.
 *
 * @param {Step[]} steps
 * @param {ReturnType<typeof runState>} state
 * @param {() => any} session the live query, for the actions a step asks for
 */
async function* inputOf(steps, state, session) {
  for (const [index, step] of steps.entries()) {
    if (index > 0) {
      const previous = step.when === 'midTurn' ? state.firstTool : state.results;
      await previous[index - 1]?.promise;
    }
    if (step.before !== undefined) {
      await BEFORE[/** @type {keyof typeof BEFORE} */ (step.before)](session());
    }
    state.turn = index;
    state.sent = index + 1;
    yield userMessage(step);
  }
}

/**
 * The hooks and the callback a recording runs with, writing what they saw into `seen`.
 *
 * @param {{ canUseTool: { toolName: string, input: unknown }[], preToolUse: { toolName: string, toolUseId: string | undefined, effort?: string }[] }} seen
 */
function recordingCallbacks(seen) {
  return {
    hooks: {
      PreToolUse: [
        {
          hooks: [
            /**
             * @param {{ tool_name?: string, effort?: { level?: string } }} input
             * @param {string | undefined} toolUseId
             */
            (input, toolUseId) => {
              seen.preToolUse.push({
                toolName: input.tool_name ?? 'unknown',
                toolUseId,
                ...(input.effort?.level === undefined ? {} : { effort: input.effort.level }),
              });
              return Promise.resolve({ continue: true });
            },
          ],
        },
      ],
    },
    /**
     * @param {string} toolName
     * @param {Record<string, unknown>} input
     */
    canUseTool: (toolName, input) => {
      seen.canUseTool.push({ toolName, input });
      // A question is answered — the first option of each — the way the product answers one: an
      // input handed back as it came reads to the CLI as "did not answer" (plan 24, B-11).
      return Promise.resolve({
        behavior: 'allow',
        updatedInput: toolName === QUESTION_TOOL ? answeredWithFirstOptions(input) : input,
      });
    },
  };
}

/**
 * Reads the stream of a run to its end — every turn's result, or the quiet after the last prompt.
 *
 * Every prompt in and a turn ended with fewer results than prompts means the SDK may have folded a
 * prompt into a running turn (D-14): the run waits a while for one more result, then closes itself,
 * and the stream ending that way is not a failure.
 *
 * @param {any} session
 * @param {ReturnType<typeof runState>} state
 * @param {number} turns
 * @param {unknown[]} messages
 * @param {number} quietMs
 */
async function consume(session, state, turns, messages, quietMs) {
  /** @type {NodeJS.Timeout | undefined} */
  let quiet;
  try {
    for await (const message of session) {
      messages.push(message);
      if (observe(message, state, turns)) {
        break;
      }
      if (quiet === undefined && state.sent === turns && state.resultsSeen > 0) {
        quiet = setTimeout(() => {
          state.quiet = true;
          session.close();
        }, quietMs);
      }
    }
  } catch (error) {
    if (!state.quiet) {
      throw error;
    }
  } finally {
    clearTimeout(quiet);
  }
}

/**
 * Runs one scenario and returns everything that happened.
 *
 * `canUseTool` answers `allow` and records that it was asked. It has to answer something, and
 * denying would record a stream of refusals rather than a stream of work — but **which** tools it
 * was consulted about is the measurement the fixture carries. A question it answers with the first
 * option of each, as a person would answer it.
 *
 * The prompts go one per turn: the next is sent when the previous turn's `result` arrives, unless a
 * step asks to be sent mid-turn.
 *
 * @param {(params: unknown) => AsyncIterable<unknown> & { close(): void }} query
 * @param {(typeof SCENARIOS)[number]} scenario
 */
async function record(query, scenario) {
  const workspace = makeWorkspace(scenario.files);
  const steps = stepsOf(scenario);
  const state = runState(steps);
  const seen = { canUseTool: [], preToolUse: [] };

  /** @type {unknown[]} */
  const messages = [];
  /** @type {string[]} */
  const stderr = [];
  /** @type {any} */
  let session = null;

  const abortController = new AbortController();
  const deadline = setTimeout(() => abortController.abort(), SCENARIO_TIMEOUT_MS);
  const transcript = scenario.watchTranscript
    ? watchTranscript(() => state.claudeSessionId, workspace)
    : null;

  // The callbacks are built before the call and spread into it, but `settingSources` stays written
  // here, in the arguments of the `query(` call — where `pnpm scan:security` looks for it.
  const callbacks = recordingCallbacks(seen);
  session = query({
    prompt: inputOf(steps, state, () => session),
    options: {
      cwd: workspace,
      // The same value the product runs with, and for the same reason: omitting it loads the
      // user's own `allow` rules and skips `canUseTool` in silence.
      settingSources: ['project'],
      hooks: callbacks.hooks,
      canUseTool: callbacks.canUseTool,
      includePartialMessages: true,
      includeHookEvents: true,
      allowDangerouslySkipPermissions: false,
      maxTurns: 20,
      abortController,
      env: { ...recordingEnvironment(), ...(scenario.env ?? {}) },
      /** @param {string} data */
      stderr: (data) => stderr.push(data),
      ...(scenario.options ?? {}),
    },
  });

  try {
    await consume(session, state, steps.length, messages, scenario.quietMs ?? QUIET_MS);
  } finally {
    clearTimeout(deadline);
    session.close();
    fs.rmSync(workspace, { recursive: true, force: true });
  }

  return { messages, ...seen, stderr, transcript: transcript?.stop() ?? null };
}

/**
 * Asks the installation for its slash commands, and says nothing to the model.
 *
 * The prompt iterable never yields: `supportedCommands()` is answered from the initialisation of the
 * subprocess, and a prompt would spend quota to learn nothing more.
 *
 * @param {(params: unknown) => { supportedCommands(): Promise<unknown[]>, close(): void }} query
 */
async function recordCatalogue(query) {
  return idleSession(query, (session) => session.supportedCommands(), CATALOGUE.files);
}

/**
 * Asks an idle session for its models, its MCP servers and its context, saying nothing to the model.
 *
 * @param {(params: unknown) => { supportedModels(): Promise<unknown[]>, mcpServerStatus(): Promise<unknown[]>, getContextUsage(opts: unknown): Promise<unknown>, close(): void }} query
 */
async function recordInstallation(query) {
  return idleSession(query, async (session) => ({
    models: await session.supportedModels(),
    mcpServers: await session.mcpServerStatus(),
    contextUsage: await session.getContextUsage({ detail: 'summary' }),
  }));
}

/**
 * Asks an idle session what it says of itself at initialisation, saying nothing to the model — the
 * account replaced by the example (plan 13, B-10).
 *
 * @param {(params: unknown) => any} query
 */
async function recordInitialization(query) {
  return idleSession(query, async (session) => {
    const init = await session.initializationResult();
    return {
      initialization: { ...init, commands: [], account: exampleAccount(init.account) },
      account: exampleAccount(await session.accountInfo()),
      agents: await session.supportedAgents(),
      skills: (await session.reloadSkills()).skills,
    };
  });
}

/**
 * Opens a session that is never prompted, asks it `ask`, and closes it — the throwaway directory
 * with it.
 *
 * @template T
 * @param {(params: unknown) => any} query
 * @param {(session: any) => Promise<T>} ask
 * @param {Record<string, string>} [files] what the workspace is seeded with
 * @returns {Promise<T>}
 */
async function idleSession(query, ask, files = {}) {
  const workspace = makeWorkspace(files);
  // An iterable whose first `next()` never settles: the CLI waits for a prompt that never comes.
  const idle = { [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => undefined) }) };

  const session = query({
    prompt: idle,
    options: {
      cwd: workspace,
      settingSources: ['project'],
      hooks: { PreToolUse: [{ hooks: [() => Promise.resolve({ continue: true })] }] },
      canUseTool: () => Promise.resolve({ behavior: 'deny', message: 'recording the catalogue' }),
      allowDangerouslySkipPermissions: false,
    },
  });

  try {
    return await ask(session);
  } finally {
    session.close();
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

/**
 * Rewrites what belongs to this machine out of a recording.
 *
 * The throwaway path contains the temp directory and a random suffix, and the CLI writes it twice:
 * as a path, and as the **slug** it names its per-project folders with (`/tmp/rc-fixture-x` →
 * `-tmp-rc-fixture-x`, under the user's home). Left in, every recording would differ from every
 * other for a reason that has nothing to do with the SDK — and the home directory of whoever
 * recorded it would be committed to the repository.
 *
 * Fragments of the path inside a streamed delta are cut wherever the model's tokens fell and are
 * left as they are: rewriting half a token would make the deltas stop adding up to the message they
 * stream.
 *
 * @param {unknown} value
 * @param {string} workspace
 * @returns {unknown}
 */
function normalise(value, workspace) {
  const exact = JSON.stringify(value)
    .split(JSON.stringify(workspace).slice(1, -1))
    .join('/workspace')
    .split(slugOf(workspace))
    .join('-workspace');

  return JSON.parse(anonymised(exact));
}

/**
 * The folder name the CLI gives a project directory: every non-alphanumeric character a dash.
 *
 * @param {string} directory
 * @returns {string}
 */
function slugOf(directory) {
  return directory.replace(/[^A-Za-z0-9]/g, '-');
}

/** Any throwaway directory of this recorder, as a path or as a slug. */
const THROWAWAY = /\/tmp\/rc-fixture-[A-Za-z0-9]{6}/g;
const THROWAWAY_SLUG = /-tmp-rc-fixture-[A-Za-z0-9]{6}/g;

/**
 * The rules that need no knowledge of which run produced the text: any throwaway directory of this
 * recorder, and the home directory of the machine.
 *
 * @param {string} text
 * @returns {string}
 */
function anonymised(text) {
  return text
    .replace(THROWAWAY, '/workspace')
    .replace(THROWAWAY_SLUG, '-workspace')
    .split(os.homedir())
    .join('/home/user');
}

/**
 * Applies the rules to the fixtures already committed, without running the SDK — for a rule added
 * after they were recorded. It spends no quota, and it changes nothing the SDK said.
 */
async function normaliseCommitted() {
  title('Agent SDK — normalising the recorded fixtures');

  for (const file of fs.readdirSync(FIXTURES_DIR).filter((name) => name.endsWith('.json'))) {
    const full = path.join(FIXTURES_DIR, file);
    const before = fs.readFileSync(full, 'utf8');

    await writeFixture(full, JSON.parse(anonymised(JSON.stringify(JSON.parse(before)))));
    ok(file, fs.readFileSync(full, 'utf8') === before ? 'unchanged' : 'normalised');
  }
}

/**
 * What the SDK reads back of a recorded run — `getSessionMessages`, the transcript the history is
 * read from —, anonymised like the rest (plan 22, B-05).
 *
 * The stream and the transcript are not the same list: the CLI files the prompts, which it never
 * echoes, and stamps every entry with the instant it was written. A test of the history needs the
 * second, and this is it, read from the run itself and never typed.
 *
 * @param {{ getSessionMessages(id: string): Promise<unknown[]> }} sdk
 * @param {readonly unknown[]} messages the run's stream, which names its session
 * @param {string} cwd the throwaway workspace, when the run is the one recording now
 */
async function historyOf(sdk, messages, cwd) {
  const sessionId = sessionIdOf(messages);

  if (sessionId === null) {
    return null;
  }

  const history = await sdk.getSessionMessages(sessionId);
  return cwd === '' ? JSON.parse(anonymised(JSON.stringify(history))) : normalise(history, cwd);
}

/**
 * What each subagent of a recorded run said, as the SDK files it apart from the conversation — by
 * agent id, read the way the backend reads it (`listSubagents`, then `getSubagentMessages`) and
 * anonymised like the rest (plan 26, B-20).
 *
 * @param {{ listSubagents(id: string): Promise<string[]>, getSubagentMessages(id: string, agentId: string): Promise<unknown[]> }} sdk
 * @param {(typeof SCENARIOS)[number]} scenario — read only when it asks for it
 * @param {readonly unknown[]} messages the run's stream, which names its session
 * @param {string} cwd the throwaway workspace
 */
async function subagentsOf(sdk, scenario, messages, cwd) {
  const sessionId = sessionIdOf(messages);

  if (scenario.subagentHistory !== true || sessionId === null) {
    return null;
  }

  /** @type {Record<string, unknown>} */
  const filed = {};
  for (const agentId of await sdk.listSubagents(sessionId)) {
    filed[agentId] = normalise(await sdk.getSubagentMessages(sessionId, agentId), cwd);
  }
  return filed;
}

/**
 * The session a run's stream names, or `null` when no message names one.
 *
 * @param {readonly unknown[]} messages
 * @returns {string | null}
 */
function sessionIdOf(messages) {
  const named = /** @type {{ session_id?: string } | undefined} */ (
    messages.find((m) => m !== null && typeof m === 'object' && 'session_id' in m)
  );
  return named?.session_id ?? null;
}

/**
 * Adds the history to fixtures already recorded, without running them again — for a run whose
 * transcript is still in the store of this machine. It spends no quota.
 *
 * @param {{ getSessionMessages(id: string): Promise<unknown[]> }} sdk
 * @param {readonly string[]} names
 */
async function addHistory(sdk, names) {
  title('Agent SDK — reading back the history of recorded runs');

  for (const name of names) {
    const full = path.join(FIXTURES_DIR, `${name}.json`);
    const fixture = JSON.parse(fs.readFileSync(full, 'utf8'));
    const history = await historyOf(sdk, fixture.messages, '');

    if (history === null || history.length === 0) {
      fail(name, 'the store of this machine no longer has its transcript; record it again');
      process.exitCode = 1;
      continue;
    }

    const { messages, ...rest } = fixture;
    await writeFixture(full, { ...rest, history, messages });
    ok(name, `${String(history.length)} entries read back`);
  }
}

/**
 * The version of the SDK these recordings came from. A fixture without it ages invisibly.
 *
 * Found by walking up from the resolved entry point rather than by resolving `package.json`
 * directly: the package's `exports` map does not publish it, and asking for a subpath a package
 * chose not to export is a resolution error, not a missing file.
 */
function sdkVersion() {
  const fromBackend = createRequire(path.join(repoRoot, 'backend', 'package.json'));
  let directory = path.dirname(fromBackend.resolve('@anthropic-ai/claude-agent-sdk'));

  for (;;) {
    const manifest = path.join(directory, 'package.json');

    if (fs.existsSync(manifest)) {
      return JSON.parse(fs.readFileSync(manifest, 'utf8')).version;
    }

    const parent = path.dirname(directory);
    if (parent === directory) {
      return 'unknown';
    }
    directory = parent;
  }
}

/**
 * Records the catalogue and writes it beside the turns.
 *
 * @param {(params: unknown) => { supportedCommands(): Promise<unknown[]>, close(): void }} query
 */
async function writeCatalogue(query) {
  info(`${bold(CATALOGUE.name)} — ${dim(CATALOGUE.why)}`);

  let commands;
  try {
    commands = await recordCatalogue(query);
  } catch (error) {
    fail(`${CATALOGUE.name} failed`, String(error));
    process.exitCode = 1;
    return;
  }

  const fixture = {
    $comment:
      'Recorded by scripts/record-agent-sdk-fixtures.mjs from a real Agent SDK run. ' +
      'Do not edit by hand — re-record instead. See docs/plans/04-transcript-and-resume/F3-commands.md.',
    name: CATALOGUE.name,
    why: CATALOGUE.why,
    recordedAt: new Date().toISOString().slice(0, 10),
    sdkVersion: sdkVersion(),
    counts: { commands: commands.length },
    commands,
  };

  await writeFixture(path.join(FIXTURES_DIR, `${CATALOGUE.name}.json`), fixture);

  ok(CATALOGUE.name, `${String(commands.length)} commands`);
}

/**
 * Records what the installation answers about itself and writes it beside the turns.
 *
 * @param {(params: unknown) => any} query
 */
async function writeInstallation(query) {
  info(`${bold(INSTALLATION.name)} — ${dim(INSTALLATION.why)}`);

  let answers;
  try {
    answers = await recordInstallation(query);
  } catch (error) {
    fail(`${INSTALLATION.name} failed`, String(error));
    process.exitCode = 1;
    return;
  }

  const fixture = {
    $comment:
      'Recorded by scripts/record-agent-sdk-fixtures.mjs from a real Agent SDK run. ' +
      'Do not edit by hand — re-record instead. See docs/plans/08-claude-panel/F4-chat-panel.md.',
    name: INSTALLATION.name,
    why: INSTALLATION.why,
    recordedAt: new Date().toISOString().slice(0, 10),
    sdkVersion: sdkVersion(),
    counts: { models: answers.models.length, mcpServers: answers.mcpServers.length },
    ...answers,
  };

  await writeFixture(path.join(FIXTURES_DIR, `${INSTALLATION.name}.json`), fixture);

  ok(INSTALLATION.name, `${String(answers.models.length)} models`);
}

/**
 * Records what the installation says at initialisation and writes it beside the turns.
 *
 * @param {(params: unknown) => any} query
 */
async function writeInitialization(query) {
  info(`${bold(INITIALIZATION.name)} — ${dim(INITIALIZATION.why)}`);

  let answers;
  try {
    answers = await recordInitialization(query);
  } catch (error) {
    fail(`${INITIALIZATION.name} failed`, String(error));
    process.exitCode = 1;
    return;
  }

  await writeFixture(path.join(FIXTURES_DIR, `${INITIALIZATION.name}.json`), {
    $comment:
      'Recorded by scripts/record-agent-sdk-fixtures.mjs from a real Agent SDK run. ' +
      'Do not edit by hand — re-record instead. See docs/plans/13-claude-settings/F1-models-and-modes.md.',
    name: INITIALIZATION.name,
    why: INITIALIZATION.why,
    recordedAt: new Date().toISOString().slice(0, 10),
    sdkVersion: sdkVersion(),
    counts: {
      models: answers.initialization.models.length,
      agents: answers.agents.length,
      skills: answers.skills.length,
    },
    // The home of the machine appears in what the CLI says of its own directories.
    ...JSON.parse(anonymised(JSON.stringify(answers))),
  });

  ok(INITIALIZATION.name, `${String(answers.initialization.models.length)} models`);
}

/**
 * Records one scenario and writes its fixture, or reports why it could not — which fails the run
 * without stopping the scenarios after it.
 *
 * @param {{
 *   query: (params: unknown) => AsyncIterable<unknown> & { close(): void },
 *   getSessionMessages(id: string): Promise<unknown[]>,
 *   listSubagents(id: string): Promise<string[]>,
 *   getSubagentMessages(id: string, agentId: string): Promise<unknown[]>,
 * }} sdk
 * @param {(typeof SCENARIOS)[number]} scenario
 */
async function recordScenario(sdk, scenario) {
  const { query } = sdk;
  info(`${bold(scenario.name)} — ${dim(scenario.why)}`);

  const started = Date.now();
  const workspace = makeWorkspace({});
  fs.rmSync(workspace, { recursive: true, force: true });

  let result;
  try {
    result = await record(query, scenario);
  } catch (error) {
    fail(`${scenario.name} failed`, String(error));
    process.exitCode = 1;
    return;
  }

  if (lacksWhatItRequires(scenario, result.canUseTool, result.messages)) {
    return;
  }

  // The `system:init` message is the only one that reports the working directory, and it is
  // what the throwaway path is normalised out of.
  const init = /** @type {{ cwd?: string } | undefined} */ (
    result.messages.find((m) => m !== null && typeof m === 'object' && 'cwd' in m)
  );
  const cwd = String(init?.cwd ?? '');
  const history = await historyOf(sdk, result.messages, cwd);
  const subagents = await subagentsOf(sdk, scenario, result.messages, cwd);

  const fixture = {
    $comment:
      'Recorded by scripts/record-agent-sdk-fixtures.mjs from a real Agent SDK run. ' +
      'Do not edit by hand — re-record instead. See docs/plans/01-live-session/F2-session-runtime.md.',
    name: scenario.name,
    why: scenario.why,
    prompt: stepsOf(scenario)[0]?.text ?? '(content blocks)',
    // Anonymised like the rest: an option may name a file of this machine — the MCP server's path.
    .../** @type {object} */ (JSON.parse(anonymised(JSON.stringify(declaredBy(scenario))))),
    ...(result.transcript === null ? {} : { transcript: result.transcript }),
    recordedAt: new Date().toISOString().slice(0, 10),
    sdkVersion: sdkVersion(),
    counts: {
      messages: result.messages.length,
      preToolUse: result.preToolUse.length,
      canUseTool: result.canUseTool.length,
    },
    preToolUse: normalise(result.preToolUse, cwd),
    canUseTool: normalise(result.canUseTool, cwd),
    stderr: result.stderr,
    ...(history === null ? {} : { history }),
    ...(subagents === null ? {} : { subagents }),
    messages: normalise(result.messages, cwd),
  };

  await writeFixture(path.join(FIXTURES_DIR, `${scenario.name}.json`), fixture);

  ok(
    scenario.name,
    `${String(fixture.counts.messages)} messages · ${String(fixture.counts.preToolUse)} hooks · ` +
      `${String(fixture.counts.canUseTool)} canUseTool · ${String(Date.now() - started)}ms`,
  );
}

/**
 * Whether a recording lacks what its scenario requires — said loudly, and the run failed: the model
 * did not cooperate, and a fixture that proves less than the tests built on it claim is worse than
 * none (plan 24, R-04). Nothing is written; run it again.
 *
 * @param {(typeof SCENARIOS)[number]} scenario
 * @param {{ toolName: string, input: unknown }[]} consulted
 * @param {unknown[]} messages
 */
function lacksWhatItRequires(scenario, consulted, messages) {
  const missing = scenario.requires?.(consulted, messages) ?? [];

  if (missing.length > 0) {
    fail(`${scenario.name} was not written`, missing.join('; '));
    process.exitCode = 1;
  }

  return missing.length > 0;
}

/**
 * What a scenario declared beyond its first prompt — written to its fixture only when it did.
 *
 * @param {(typeof SCENARIOS)[number]} scenario
 */
function declaredBy(scenario) {
  return {
    ...(scenario.prompts === undefined
      ? {}
      : { prompts: stepsOf(scenario).map((step) => step.text ?? '(content blocks)') }),
    ...(scenario.options === undefined ? {} : { options: scenario.options }),
    ...(scenario.env === undefined ? {} : { env: scenario.env }),
  };
}

/**
 * What this run records: the scenarios named, and the two answers about the installation — all of
 * them when nothing is named.
 *
 * @param {readonly string[]} wanted
 */
function chosenRecordings(wanted) {
  const all = wanted.length === 0;
  const chosen = all ? SCENARIOS : SCENARIOS.filter((s) => wanted.includes(s.name));
  const catalogue = all || wanted.includes(CATALOGUE.name);
  const installation = all || wanted.includes(INSTALLATION.name);
  const initialization = all || wanted.includes(INITIALIZATION.name);

  if (chosen.length === 0 && !catalogue && !installation && !initialization) {
    const known = [
      ...SCENARIOS.map((s) => s.name),
      CATALOGUE.name,
      INSTALLATION.name,
      INITIALIZATION.name,
    ];
    abort(`no scenario named ${wanted.join(', ')}; known: ${known.join(', ')}`);
  }

  return { chosen, catalogue, installation, initialization };
}

/**
 * The recordings that ask the installation instead of running a turn, each when it was chosen.
 *
 * @param {(params: unknown) => any} query
 * @param {{ catalogue: boolean, installation: boolean, initialization: boolean }} chosen
 */
async function writeAsked(query, chosen) {
  if (chosen.catalogue) {
    await writeCatalogue(query);
  }
  if (chosen.installation) {
    await writeInstallation(query);
  }
  if (chosen.initialization) {
    await writeInitialization(query);
  }
}

async function main() {
  if (process.argv.includes('--normalise')) {
    await normaliseCommitted();
    return;
  }

  const names = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const readBack = process.argv.includes('--history');

  if (!readBack) {
    title('Agent SDK — recording fixtures');
  }

  const { chosen, catalogue, installation, initialization } = readBack
    ? { chosen: [], catalogue: false, installation: false, initialization: false }
    : chosenRecordings(names);

  if (!fs.existsSync(path.join(os.homedir(), '.claude', '.credentials.json'))) {
    abort('the Claude CLI is not logged in on this machine; run `claude` once and sign in');
  }

  // Resolved from the backend package rather than from here: the SDK is a dependency of the
  // backend, and the one rule that matters about it is that nothing outside
  // `backend/src/adapter/outbound/claude/` imports it. A root dependency would make that rule
  // harder to see and this script's presence in `scripts/` harder to justify.
  const fromBackend = createRequire(path.join(repoRoot, 'backend', 'package.json'));
  const sdk = await import(
    pathToFileURL(fromBackend.resolve('@anthropic-ai/claude-agent-sdk')).href
  );

  if (readBack) {
    await addHistory(sdk, names);
    return;
  }

  fs.mkdirSync(FIXTURES_DIR, { recursive: true });

  for (const scenario of chosen) {
    await recordScenario(sdk, scenario);
  }

  await writeAsked(sdk.query, { catalogue, installation, initialization });

  if (chosen.some((s) => s.name === 'tool-turn')) {
    warn(
      'the tool-turn counts are a measurement, not a target',
      'if hooks and canUseTool no longer differ, the assumption behind the audit trail changed',
    );
  }
}

await main();
