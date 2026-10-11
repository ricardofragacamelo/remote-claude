import type { CanonicalTool, Interaction } from '@domain/engine';
import type {
  Interaction as InteractionPayload,
  ToolStartedPayload,
} from '@remote-claude/contracts';

/** The fields a canonical tool travels with, on `tool.started` and on `permission.requested`. */
export type CanonicalToolPayload = Pick<
  ToolStartedPayload,
  'kind' | 'label' | 'subject' | 'changes' | 'origin' | 'rawInput' | 'interaction'
>;

/**
 * [tool] and the input it was called with, as the contract carries them (plan 28, B-15).
 *
 * A change goes without its text: the diff comes from the route, never from the client (D-28). The
 * input goes whole and opaque, for the exact input and the export, and nothing reads a field of it
 * (D-04).
 */
export function canonicalToolPayload(
  tool: CanonicalTool,
  rawInput: Readonly<Record<string, unknown>>,
): CanonicalToolPayload {
  return {
    kind: tool.kind,
    label: { messageKey: tool.label.messageKey, params: { ...tool.label.params } },
    subject: tool.subject,
    changes: tool.changes.map((change) => ({
      path: change.path,
      op: change.op,
      ...(change.to === undefined ? {} : { to: change.to }),
    })),
    origin: { engine: tool.origin.engine, native: tool.origin.native },
    rawInput,
    ...(tool.interaction === undefined
      ? {}
      : { interaction: interactionPayload(tool.interaction) }),
  };
}

/**
 * A question or a plan as the contract's `Interaction` carries it (plan 24; plan 28, B-20).
 *
 * What the agent wrote before a cut stays on this side: it is what the engine expects back, and a
 * screen shows and answers with what the server published. A preview, and a plan's path, are absent
 * rather than `null`.
 */
export function interactionPayload(interaction: Interaction): InteractionPayload {
  if (interaction.kind === 'plan') {
    return {
      kind: 'plan',
      markdown: interaction.markdown,
      ...(interaction.path === null ? {} : { path: interaction.path }),
    };
  }

  return {
    kind: 'question',
    malformed: interaction.malformed,
    questions: interaction.questions.map((question) => ({
      id: question.id,
      header: question.header,
      prompt: question.prompt,
      multiSelect: question.multiSelect,
      options: question.options.map((option) => ({
        label: option.label,
        description: option.description,
        ...(option.preview === null ? {} : { preview: option.preview }),
      })),
    })),
  };
}
