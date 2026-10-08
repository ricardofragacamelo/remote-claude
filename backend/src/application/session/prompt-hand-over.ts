import type { PromptExtras } from '@domain/session';
import { base64Size } from '@domain/shared';
import type { SessionBroadcaster } from './ports/session-broadcaster.port';
import type { LiveSession } from './session-registry';

/** A prompt on its way to Claude as a turn: what Claude reads, and the kind of client that sent it. */
export interface HandedPrompt {
  readonly text: string;
  readonly extras?: PromptExtras | undefined;
  readonly promptedBy: string;
}

/**
 * Hands a prompt to Claude as a turn, and tells everybody watching what was said and from where: the
 * event a prompt results in, `message.completed` with the role `user` and its `promptedBy`
 * ([05-websocket-protocol](../../../../docs/architecture/shared/05-websocket-protocol.md#multi-cliente-na-mesma-sessão)).
 *
 * The CLI says nothing back about a prompt of the streaming input — measured on every recording but
 * `/compact` — so without this the panel and the app showed Claude's answers under no question, and a
 * prompt sent from the phone was nowhere in the browser (plan 08, F6). The message goes under the id
 * the CLI files the prompt under: the history read later and the stream are one message, never two,
 * and an edit-and-resend forks from it (D-19).
 *
 * What is said is what the person **typed**, never what was composed after it: the context goes by
 * reference, and a provider's text — the output of a terminal — is in the composed prompt, which the
 * outbound log of every frame would then quote (S-204). Claude reads the composed one, and the history
 * keeps it; an image says it is there, and never its bytes.
 */
export function handOverPrompt(
  live: LiveSession,
  broadcaster: SessionBroadcaster,
  prompt: HandedPrompt,
): void {
  const messageId = live.handle.prompt(prompt.text, prompt.extras);
  const images = prompt.extras?.images ?? [];

  broadcaster.publish(live.session.id, {
    type: 'message.completed',
    payload: {
      messageId,
      role: 'user',
      // Each block under the id the CLI files it under — `<uuid>:<index>`, the text first and then the
      // images, as the input queue sends them — so the history read later names the same blocks
      // (plan 22, D-06). An image is its type and its size, never its bytes (D-09).
      content: [
        { type: 'text', blockId: `${messageId}:0`, text: prompt.extras?.typed ?? prompt.text },
        ...images.map((image, index) => ({
          type: 'image',
          blockId: `${messageId}:${String(index + 1)}`,
          mediaType: image.mediaType,
          size: base64Size(image.data),
        })),
      ],
      promptedBy: prompt.promptedBy,
    },
  });
}
