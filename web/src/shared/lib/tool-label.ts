import type { TFunction } from 'i18next';

import type { ToolCall } from './tool-call';

/** What a line of a tool call is drawn from: its kind, the server's label and the model's title. */
export type LabelledTool = Pick<ToolCall, 'kind' | 'label'> & {
  readonly title?: string | undefined;
};

/** The line of a tool call, translated. */
export interface ToolLine {
  readonly text: string;

  /**
   * The plain label under a title — "Shell: pnpm test" under "Shell · Run the tests" —, so the
   * accessible name still says the command (plan 22, B-29). `null` when the text is that label.
   */
  readonly detail: string | null;
}

/**
 * The kinds of the contract this build has words for (plan 28, B-14), each with the key of its short
 * name — named in full so the i18n check sees each one. Any other kind is drawn as the generic line.
 */
const SHORT_NAMES: Readonly<Record<string, string>> = {
  'file.read': 'sessions.kind.fileRead',
  'file.edit': 'sessions.kind.fileEdit',
  'file.write': 'sessions.kind.fileWrite',
  'file.delete': 'sessions.kind.fileDelete',
  'file.move': 'sessions.kind.fileMove',
  search: 'sessions.kind.search',
  shell: 'sessions.kind.shell',
  'shell.output': 'sessions.kind.shellOutput',
  'web.fetch': 'sessions.kind.webFetch',
  'web.search': 'sessions.kind.webSearch',
  mcp: 'sessions.kind.mcp',
  agent: 'sessions.kind.agent',
  question: 'sessions.kind.question',
  plan: 'sessions.kind.plan',
  tasks: 'sessions.kind.tasks',
  other: 'sessions.kind.other',
};

/** The kinds a titled line names by their label, which says the tool already, not by the kind. */
const NAMED_BY_LABEL: ReadonlySet<string> = new Set(['mcp', 'other']);

/** A key of the row labels — anything else the server sent is not one this line translates. */
const ROW_KEY = /^sessions\.tool\.[A-Za-z]+$/;

/** The key of a kind in the catalogue: `file.edit` → `fileEdit`, `shell.output` → `shellOutput`. */
export function kindKeyOf(kind: string): string {
  return kind.replace(/\.(.)/g, (_, next: string) => next.toUpperCase());
}

/** Whether this build knows a kind — an unknown one is drawn as the generic line. */
export function isKnownKind(kind: string): boolean {
  return Object.hasOwn(SHORT_NAMES, kind);
}

/**
 * The short name of a kind — "Shell", "Edit file" —, or the generic one ("Tool") for a kind this build
 * does not know, or for none: how a rule says which calls it answers (plan 28, F5).
 */
export function kindShortName(kind: string | null, t: TFunction): string {
  const key = kind !== null && isKnownKind(kind) ? SHORT_NAMES[kind] : undefined;

  return t(key ?? 'sessions.kind.other');
}

/**
 * The generic line: the name the label carries, or the kind itself — what a kind or a key this build
 * does not know is drawn as, with its exact input a click away, never an error (plan 28, S-56).
 */
function genericLabel(tool: LabelledTool, t: TFunction): string {
  const { name } = tool.label.params;
  return t('sessions.tool.other', { name: typeof name === 'string' ? name : tool.kind });
}

/**
 * The label of a call, translated from what the server built (plan 28, D-02) — "Read src/x.ts",
 * "Edit src/x.ts (+3 −1)", "Shell: pnpm test". A kind or a key this build does not know is the
 * generic line.
 */
export function toolLabelText(tool: LabelledTool, t: TFunction): string {
  const { messageKey, params } = tool.label;

  if (!isKnownKind(tool.kind) || !ROW_KEY.test(messageKey)) {
    return genericLabel(tool, t);
  }

  return t(messageKey, { ...params, defaultValue: genericLabel(tool, t) });
}

/**
 * The line of a call. With the description the model gave it (`title`, plan 22, D-05), the line is
 * the short name of its kind and that description — "Shell · Run the tests" —, and the plain label
 * goes to the detail; an MCP tool, a tool of kind `other` and an unknown kind are named by their label
 * instead. A subagent keeps its own line, which says the description already.
 */
export function toolLine(tool: LabelledTool, t: TFunction): ToolLine {
  const plain = toolLabelText(tool, t);
  const title = tool.title?.trim() ?? '';

  if (title === '' || tool.kind === 'agent') {
    return { text: plain, detail: null };
  }

  const shortName = SHORT_NAMES[tool.kind];
  const name = shortName !== undefined && !NAMED_BY_LABEL.has(tool.kind) ? t(shortName) : plain;

  return { text: t('sessions.tool.titled', { name, title }), detail: plain };
}

/**
 * What a permission request asks, by its kind — "Run a shell command" —, or its translated label
 * when this build has no words for the kind. `engine` fills the `{{agent}}` of a text that names it.
 */
export function permissionTitle(
  tool: LabelledTool & Pick<ToolCall, 'origin'>,
  t: TFunction,
): string {
  const label = toolLabelText(tool, t);

  return isKnownKind(tool.kind)
    ? t(`permission.tool.${kindKeyOf(tool.kind)}`, {
        engine: tool.origin.engine,
        defaultValue: label,
      })
    : label;
}
