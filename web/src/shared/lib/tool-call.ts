import { isEngineOrigin, isFileChange, isToolLabel, isToolSubject } from '@remote-claude/contracts';
import type { EngineOrigin, FileChange, ToolSubject } from '@remote-claude/contracts';

import { isRecord, readText } from './json';

/** The label of a call as the server built it: a key of `sessions.tool.*` and what fills it. */
export interface ToolLabelKey {
  readonly messageKey: string;
  readonly params: Readonly<Record<string, string | number>>;
}

/**
 * A tool call as the contract describes it, whatever agent made it (plan 28, B-18): its canonical
 * `kind`, the `label` the server built, what it is about, the files it changes, where it came from
 * and the exact input. A screen draws by `kind`, `label`, `subject` and `changes`; `origin` and
 * `rawInput` are opaque — the exact input is drawn whole and exported, never read field by field.
 */
export interface ToolCall {
  readonly kind: string;
  readonly label: ToolLabelKey;
  readonly subject: ToolSubject;
  readonly changes: readonly FileChange[];
  readonly origin: EngineOrigin;
  readonly rawInput: Readonly<Record<string, unknown>>;
}

/** The operations whose change can be shown as a diff. */
const DIFFABLE_OPS: ReadonlySet<string> = new Set(['edit', 'write']);

/** The params of a label, strings and numbers only — anything else is not interpolated. */
function paramsOf(params: Readonly<Record<string, unknown>>): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(params).filter(
      (entry): entry is [string, string | number] =>
        typeof entry[1] === 'string' || typeof entry[1] === 'number',
    ),
  );
}

/** The label of a payload — one with no key, drawn as the generic line, when it carries none. */
function labelOf(value: unknown): ToolLabelKey {
  return isToolLabel(value)
    ? { messageKey: value.messageKey, params: paramsOf(value.params) }
    : { messageKey: '', params: {} };
}

/**
 * The canonical fields of a `tool.started` or a `permission.requested`, or `null` when the payload
 * names no kind — a frame of something that is not this protocol. A field out of shape reads as
 * empty: an unknown kind or label is drawn as the generic line, never an error.
 */
export function readToolCall(payload: Readonly<Record<string, unknown>>): ToolCall | null {
  const kind = readText(payload, 'kind');

  if (kind === null) {
    return null;
  }

  const { subject, changes, origin, rawInput } = payload;

  return {
    kind,
    label: labelOf(payload['label']),
    subject: isToolSubject(subject) ? subject : {},
    changes: Array.isArray(changes) ? changes.filter(isFileChange) : [],
    origin: isEngineOrigin(origin) ? origin : { engine: '', native: '' },
    rawInput: isRecord(rawInput) ? rawInput : {},
  };
}

/** Whether a call changes a file the way a diff can show — an edit or a whole write. */
export function changesFileText(changes: readonly FileChange[]): boolean {
  return changes.some((change) => DIFFABLE_OPS.has(change.op));
}

/** The whole command line of a shell call — what its IN shows —, or `null` for any other call. */
export function commandOf(subject: ToolSubject): string | null {
  return typeof subject.command === 'string' ? subject.command : null;
}
