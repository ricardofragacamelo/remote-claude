import type { Interaction } from './interaction.value-object';
import type { TaskStep } from './task-step.value-object';
import type { ToolKind } from './tool-kind.value-object';

/**
 * What a screen says of a tool call: a key the client translates and its parameters — never prose
 * (rule 2 of AGENTS.md). Built by the adapter of the engine, which reads the engine's input; the
 * client only translates it (plan 28, D-02).
 */
export interface ToolLabel {
  readonly messageKey: string;
  readonly params: Readonly<Record<string, string | number>>;
}

/**
 * What a tool call is about, normalised — every field optional, each the same thing for every
 * engine: the paths it reads or writes, the command it runs, the pattern it searches, the URL it
 * fetches, the query it searches the web for, the MCP server and tool it calls, what it says it is,
 * the part of a file it reads.
 */
export interface ToolSubject {
  readonly paths?: readonly string[];
  readonly command?: string;
  readonly pattern?: string;
  readonly url?: string;
  readonly query?: string;
  readonly server?: string;
  readonly tool?: string;
  readonly description?: string;
  /** The part of a `file.read` it reads, when it reads part: the first line and how many, or pages. */
  readonly window?: ReadWindow;
}

/** A window of a file: from which line and how many, or which pages of a document. */
export interface ReadWindow {
  readonly offset?: number;
  readonly limit?: number;
  readonly pages?: string;
}

/** One replacement of a `file.edit`: the text that was there, and what it becomes. */
export interface FileEdit {
  readonly oldText: string;
  readonly newText: string;
  /** Every occurrence, and not only the first. */
  readonly replaceAll?: boolean;
}

/**
 * What a tool call is going to change on disk — what the undo snapshots, what the diff and its
 * preview are computed from (ADR-013, plan 28, B-16). The paths are absolute.
 */
export interface FileChange {
  readonly path: string;
  readonly op: 'edit' | 'write' | 'delete' | 'move';
  /** For `edit`: the replacements, in order. */
  readonly edits?: readonly FileEdit[];
  /** For `write`: the whole new content. */
  readonly content?: string;
  /** For `move`: where it goes. */
  readonly to?: string;
}

/** Where a canonical tool came from: the engine, and its own name for it — opaque to every client. */
export interface EngineOrigin {
  readonly engine: string;
  readonly native: string;
}

/**
 * A tool call as the core reads it (ADR-025): its canonical kind, its label, what it is about and
 * what it changes, and where it came from. The adapter of each engine builds it, from a table that is
 * exhaustive; the core decides risk, diff, undo and what the trail shows by it — never by the
 * engine's name of the tool, never by its raw input.
 */
export interface CanonicalTool {
  readonly kind: ToolKind;
  readonly label: ToolLabel;
  readonly subject: ToolSubject;
  readonly changes: readonly FileChange[];
  readonly origin: EngineOrigin;
  /** On a `question` or a `plan`: what it asks the person, normalised (plan 28, B-20, B-21). */
  readonly interaction?: Interaction;
  /** On a `tasks` call that changes the list: what it does to it (plan 28, B-22). */
  readonly tasks?: TaskStep;
}

/**
 * The part of an i18n key that names [kind]: its dots removed and the letter after each one
 * upper-cased — `file.edit` is `fileEdit`, `shell` is `shell`. One rule for every key that is by
 * kind, so a kind the backend adds has its keys without a table to keep.
 */
export function toolKindKey(kind: ToolKind): string {
  return kind.replace(/\.(\w)/g, (_, letter: string) => letter.toUpperCase());
}

/**
 * Every path [tool] is about to change, absolute: each change's file, and where a `move` takes it.
 * What the undo snapshots before the call runs (ADR-013).
 */
export function pathsChangedBy(tool: Pick<CanonicalTool, 'changes'>): readonly string[] {
  return tool.changes.flatMap((change) =>
    change.op === 'move' && change.to !== undefined ? [change.path, change.to] : [change.path],
  );
}
