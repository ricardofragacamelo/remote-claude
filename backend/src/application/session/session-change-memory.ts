import type { CanonicalTool, FileChange, ToolKind } from '@domain/engine';
import { diffableChangeOf } from '@domain/session';
import type { Session } from '@domain/session';

/** How many tool invocations of one session are remembered — the oldest go first. */
export const MAX_REMEMBERED_TOOLS = 2_000;

/**
 * How much of the changes of one session is remembered, in characters.
 *
 * A `write` carries the whole file. Past this, the oldest invocations are forgotten, and a diff
 * asked of one of them is `TOOL_USE_NOT_FOUND` — the honest answer for a change nobody kept.
 */
export const MAX_REMEMBERED_INPUT_CHARS = 16 * 1024 * 1024;

/** A tool invocation of a live session, as the hook before each call reported it. */
export interface RememberedInvocation {
  readonly toolUseId: string;
  /** The call, as the core reads it — its change is what the diff is made of. */
  readonly tool: CanonicalTool;
  readonly promptId: string | null;
}

/** One remembered invocation, and where it stands among the others. */
interface RememberedTool {
  readonly toolUseId: string;
  readonly kind: ToolKind;

  /** Only a diffable call's: what anything else changes is the trail's, and nothing here needs it. */
  readonly change: FileChange | null;

  /** The turn — `unknown` when the hook carried none, as the journal names it. */
  readonly promptId: string;
  readonly path: string | null;
  readonly order: number;
  readonly size: number;
}

/** A tool invocation, with what its diff needs to know of the others. */
export interface RecordedTool {
  readonly toolUseId: string;
  readonly kind: ToolKind;
  /** The change its diff is made of — `null` for a call with no diff. */
  readonly change: FileChange | null;
  readonly promptId: string;

  /** No earlier write of the same turn reached the same file. */
  readonly firstTouchInTurn: boolean;

  /** No later write of the session reached the same file. */
  readonly lastWrite: boolean;
}

/**
 * What a rejection replaced — kept so it can be undone, while the file is still what it left
 * (plan 08, D-08: undo instead of confirm).
 */
export interface Rejection {
  readonly path: string;

  /** The turn the file goes back towards — what the outcome names. */
  readonly promptId: string;

  /** The hunk, for a hunk; absent when the whole file was rejected. */
  readonly hunkId?: string;

  /** The revision the hunk was rejected against — what a repeated request carries. */
  readonly revision?: string;

  /** What was there before the rejection, or `null` when nothing was. */
  readonly replaced: Uint8Array | null;

  /** The hash of what the rejection left, or `null` when it left nothing. */
  readonly left: string | null;
}

/**
 * What a live session's changes need to remember that the journal does not keep — plan 08, F3.
 *
 * The change of each call that writes a file: the diff of a tool is made of it (plan 08, D-03),
 * and the trail that holds it is write-only to this module. And what each rejection replaced, so it
 * can be undone.
 *
 * In memory, keyed by the **session object**: when the live session goes, so does this — there is
 * no hook to forget it on, and none is needed. A diff or an undo is only ever offered on a live
 * session, the same policy as the undo of plan 04.
 */
export class SessionChangeMemory {
  private readonly tools = new WeakMap<Session, RememberedTool[]>();
  private readonly rejections = new WeakMap<Session, Map<string, Rejection>>();
  private readonly orders = new WeakMap<Session, number>();

  /** Remembers one invocation. A redelivered one — the same id — is remembered once. */
  rememberTool(session: Session, invocation: RememberedInvocation): void {
    const tools = this.tools.get(session) ?? [];

    if (tools.some((tool) => tool.toolUseId === invocation.toolUseId)) {
      return;
    }

    const order = (this.orders.get(session) ?? 0) + 1;
    this.orders.set(session, order);

    const change = diffableChangeOf(invocation.tool);

    tools.push({
      toolUseId: invocation.toolUseId,
      kind: invocation.tool.kind,
      change,
      promptId: invocation.promptId ?? 'unknown',
      path: change?.path ?? null,
      order,
      size: change === null ? 0 : JSON.stringify(change).length,
    });

    this.tools.set(session, bounded(tools));
  }

  /** The invocation, with where it stands among the writes of its file — `null` for none kept. */
  toolOf(session: Session, toolUseId: string): RecordedTool | null {
    const tools = this.tools.get(session) ?? [];
    const tool = tools.find((candidate) => candidate.toolUseId === toolUseId);

    if (tool === undefined) {
      return null;
    }

    const sameFile = tools.filter(
      (other) => other.path !== null && other.path === tool.path && other !== tool,
    );

    return {
      toolUseId: tool.toolUseId,
      kind: tool.kind,
      change: tool.change,
      promptId: tool.promptId,
      firstTouchInTurn: !sameFile.some(
        (other) => other.promptId === tool.promptId && other.order < tool.order,
      ),
      lastWrite: !sameFile.some((other) => other.order > tool.order),
    };
  }

  /** Remembers what a rejection replaced — the last one of a file, which is the one undone. */
  rememberRejection(session: Session, rejection: Rejection): void {
    const kept = this.rejections.get(session) ?? new Map<string, Rejection>();
    kept.set(rejection.path, rejection);
    this.rejections.set(session, kept);
  }

  rejectionOf(session: Session, path: string): Rejection | null {
    return this.rejections.get(session)?.get(path) ?? null;
  }

  forgetRejection(session: Session, path: string): void {
    this.rejections.get(session)?.delete(path);
  }
}

/** The newest invocations, within both ceilings. */
function bounded(tools: RememberedTool[]): RememberedTool[] {
  let size = tools.reduce((sum, tool) => sum + tool.size, 0);
  let from = Math.max(0, tools.length - MAX_REMEMBERED_TOOLS);

  for (let index = 0; index < from; index += 1) {
    size -= tools[index]?.size ?? 0;
  }

  while (size > MAX_REMEMBERED_INPUT_CHARS && from < tools.length - 1) {
    size -= tools[from]?.size ?? 0;
    from += 1;
  }

  return from === 0 ? tools : tools.slice(from);
}
