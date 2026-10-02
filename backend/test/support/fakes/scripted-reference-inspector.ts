import type { InspectedReference, ReferenceInspector } from '@application/session';
import { AttachmentStore, PromptContextResolver } from '@application/session';
import type { WorkspacePath } from '@domain/workspace';
import { FixedClock } from './fixed-clock';

/** One question the inspector was asked. */
export interface InspectedAsk {
  readonly workspace: string;
  readonly raw: string;
  readonly kind: 'file' | 'folder';
}

/**
 * The fence of `files`, scripted: every path passes with a size of its length, unless a refusal was
 * set for it — what a unit of the session needs without a disk.
 */
export class ScriptedReferenceInspector implements ReferenceInspector {
  readonly asked: InspectedAsk[] = [];
  private readonly refusals = new Map<string, Error>();

  refuse(raw: string, error: Error): this {
    this.refusals.set(raw, error);
    return this;
  }

  inspect(
    workspace: WorkspacePath,
    raw: string,
    kind: 'file' | 'folder',
  ): Promise<InspectedReference> {
    this.asked.push({ workspace: workspace.value, raw, kind });

    const refusal = this.refusals.get(raw);
    if (refusal !== undefined) {
      return Promise.reject(refusal);
    }

    return Promise.resolve({ relative: raw, size: kind === 'file' ? raw.length : 0 });
  }
}

/** A resolver over a scripted inspector and an empty store — the context of a unit. */
export function aContextResolver(
  inspector: ReferenceInspector = new ScriptedReferenceInspector(),
  store = new AttachmentStore(new FixedClock(new Date('2026-10-02T12:00:00.000Z')), {
    ttlMs: 60_000,
    memoryBytes: 1024 * 1024,
  }),
): PromptContextResolver {
  return new PromptContextResolver(inspector, store);
}
