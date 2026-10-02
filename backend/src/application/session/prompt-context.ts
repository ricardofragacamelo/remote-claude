import { composePrompt, guardMentions } from '@domain/session';
import type {
  ContextFact,
  PromptExtras,
  PromptImage,
  PromptReference,
  PromptText,
} from '@domain/session';
import type { InspectedReference, ReferenceInspector } from './ports/prompt-reference.port';
import type { AttachmentStore, HeldAttachment } from './prompt-attachments';
import type { LiveSession } from './session-registry';

/** One item of the context of a prompt, as the contract carries it (plan 08, B-01). */
export type PromptAttachment =
  | {
      readonly kind?: 'file' | undefined;
      readonly path: string;
      readonly range?: { readonly startLine: number; readonly endLine: number } | undefined;
    }
  | { readonly kind: 'folder'; readonly path: string }
  | { readonly kind: 'upload'; readonly attachmentId: string }
  | {
      readonly kind: 'text';
      readonly source: string;
      readonly label: string;
      readonly content: string;
    };

/** A prompt ready for Claude: the text it reads, and what goes beside it. */
export interface OutgoingPrompt {
  readonly text: string;

  /** Absent for a prompt with no context: nothing beside the text, and the log quotes the text. */
  readonly extras?: PromptExtras;
}

/** One item, checked: a part of the text, an image, and what the log says of it. */
type Resolved =
  | { readonly kind: 'reference'; readonly reference: PromptReference; readonly fact: ContextFact }
  | { readonly kind: 'text'; readonly text: PromptText; readonly fact: ContextFact }
  | { readonly kind: 'image'; readonly image: PromptImage; readonly fact: ContextFact };

/**
 * The context of a prompt, checked and composed — plan 08, B-44 and B-45.
 *
 * **All or nothing**, before anything reaches Claude: one item that does not pass refuses the whole
 * prompt, with the refusal of the first of them in the order they were chosen — never a prompt sent
 * with part of what the person chose (S-199). A file or a folder is checked against the session's
 * own folder, by the fence of `files`; an upload is one this session holds; a text is already
 * bounded by the schema.
 */
export class PromptContextResolver {
  constructor(
    private readonly inspector: ReferenceInspector,
    private readonly attachments: AttachmentStore,
  ) {}

  /**
   * @throws whatever the first item that does not pass is refused with —
   *   `WORKSPACE_NOT_ALLOWED`, `FILE_NOT_FOUND`, `FILE_NOT_TEXT`, `INVALID_INPUT`,
   *   `ATTACHMENT_NOT_FOUND`
   */
  async resolve(
    live: LiveSession,
    typed: string,
    items: readonly PromptAttachment[],
  ): Promise<OutgoingPrompt> {
    if (items.length === 0) {
      return { text: guardMentions(typed) };
    }

    const settled = await Promise.allSettled(items.map((item) => this.resolveOne(live, item)));
    const refused = settled.find((outcome) => outcome.status === 'rejected');

    if (refused !== undefined) {
      throw refused.reason;
    }

    const resolved = settled.flatMap((outcome) =>
      outcome.status === 'fulfilled' ? [outcome.value] : [],
    );

    return {
      text: composePrompt(
        typed,
        resolved.flatMap((each) => (each.kind === 'reference' ? [each.reference] : [])),
        resolved.flatMap((each) => (each.kind === 'text' ? [each.text] : [])),
      ),
      extras: {
        typed,
        images: resolved.flatMap((each) => (each.kind === 'image' ? [each.image] : [])),
        context: resolved.map((each) => each.fact),
      },
    };
  }

  private async resolveOne(live: LiveSession, item: PromptAttachment): Promise<Resolved> {
    switch (item.kind) {
      case 'upload':
        return uploaded(this.attachments.take(live.session.id.value, item.attachmentId));
      case 'text':
        return {
          kind: 'text',
          text: { source: item.source, label: item.label, content: item.content },
          fact: { kind: 'text', bytes: Buffer.byteLength(item.content, 'utf8') },
        };
      case 'folder':
        return referenceTo(
          'folder',
          await this.inspector.inspect(live.session.workspace, item.path, 'folder'),
          null,
        );
      default:
        return referenceTo(
          'file',
          await this.inspector.inspect(live.session.workspace, item.path, 'file'),
          item.range === undefined
            ? null
            : { start: item.range.startLine, end: item.range.endLine },
        );
    }
  }
}

/** A file or a folder, as the line Claude reads and as the log says it. */
function referenceTo(
  kind: 'file' | 'folder',
  inspected: InspectedReference,
  lines: PromptReference['lines'],
): Resolved {
  const path = inspected.relative === '' ? '.' : inspected.relative;
  const range = lines === null ? {} : { lines: `${String(lines.start)}-${String(lines.end)}` };

  return {
    kind: 'reference',
    reference: { kind, path, lines },
    fact: { kind, path, ...range, ...(kind === 'file' ? { bytes: inspected.size } : {}) },
  };
}

/** An upload: an image beside the text, or a text delimited with the name of its file. */
function uploaded(held: HeldAttachment): Resolved {
  const fact: ContextFact = {
    kind: 'upload',
    mediaType: held.mediaType,
    bytes: held.size,
    sha256: held.sha256,
  };

  return held.kind === 'image'
    ? {
        kind: 'image',
        image: { mediaType: held.mediaType, data: Buffer.from(held.bytes).toString('base64') },
        fact,
      }
    : {
        kind: 'text',
        text: { source: 'upload', label: held.name, content: new TextDecoder().decode(held.bytes) },
        fact,
      };
}
