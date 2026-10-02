import {
  SESSION_PROMPT_PAYLOAD_ATTACHMENTS_ITEM_LIMITS as ITEM_LIMITS,
  SESSION_PROMPT_PAYLOAD_ATTACHMENTS_ITEM_RANGE_LIMITS as RANGE_LIMITS,
  SESSION_PROMPT_PAYLOAD_LIMITS as PROMPT_LIMITS,
} from '@remote-claude/contracts';
import { z } from 'zod';

import { PERMISSION_MODES } from '@domain/session';

/**
 * The lines of a file a prompt is about.
 *
 * The floor of a line is the schema's (`minimum`, read from the generated bounds rather than
 * repeated); the order of the two lines is not a bound of either, so it is checked here — and only
 * here, which is why the contract says so in the description of `range` (plan 08, S-04).
 */
const range = z
  .object({
    startLine: z.number().int().min(RANGE_LIMITS.startLine.minimum),
    endLine: z.number().int().min(RANGE_LIMITS.endLine.minimum),
  })
  .refine((lines) => lines.endLine >= lines.startLine, {
    path: ['endLine'],
    message: 'endLine comes before startLine',
  });

const path = z.string().min(1).max(4096);

/**
 * One attachment of a prompt, by its `kind` — the `x-required-when` of the schema, as the backend
 * enforces it with every invalid field listed rather than the first.
 *
 * A `file` without a kind is the attachment that existed before kinds did, and stays valid.
 */
const attachment = z.union([
  z.object({
    kind: z.literal('file').optional(),
    path,
    mediaType: z.string().min(1).optional(),
    range: range.optional(),
  }),
  z.object({ kind: z.literal('folder'), path }),
  z.object({ kind: z.literal('upload'), attachmentId: z.string().min(1).max(256) }),
  z.object({
    kind: z.literal('text'),
    source: z.enum(['terminal']),
    label: z.string().min(1).max(ITEM_LIMITS.label.maxLength),
    content: z.string().max(ITEM_LIMITS.content.maxLength),
  }),
]);

/** What a prompt carries, as the backend reads it: an attachment of the contract, one by kind. */
export type PromptAttachmentDto = z.infer<typeof attachment>;

/**
 * How many files one rejection may name. A rejection is of a file the person chose on screen; the
 * whole session goes back without `paths`.
 */
const MAX_REJECTED_PATHS = 256;

/** The payloads the session commands carry, as the contract declares them. */
export const sessionSchemas = {
  session: z.object({ sessionId: z.string().min(1) }),
  start: z
    .object({
      workspacePath: z.string().min(1),
      model: z.string().min(1).optional(),
      permissionMode: z.enum(PERMISSION_MODES).optional(),
      effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
      resumeSessionId: z.string().min(1).optional(),
      forkAt: z.string().min(1).max(256).optional(),
    })
    // The `x-required-when` of the schema: a fork point is a message of a conversation, and only a
    // resumed conversation has one (plan 08, S-08).
    .refine((start) => start.forkAt === undefined || start.resumeSessionId !== undefined, {
      path: ['resumeSessionId'],
      message: 'forkAt needs resumeSessionId',
    }),
  prompt: z.object({
    sessionId: z.string().min(1),
    text: z.string().min(1),
    attachments: z.array(attachment).max(PROMPT_LIMITS.attachments.maxItems).optional(),
  }),
  model: z.object({ sessionId: z.string().min(1), model: z.string().min(1) }),
  mode: z.object({ sessionId: z.string().min(1), mode: z.enum(PERMISSION_MODES) }),
  locale: z.object({ locale: z.enum(['en', 'pt-BR']) }),
  rewind: z.object({
    sessionId: z.string().min(1),
    promptId: z.string().min(1).max(256),
    paths: z.array(path).min(1).max(MAX_REJECTED_PATHS).optional(),
  }),
  rejectChange: z.object({
    sessionId: z.string().min(1),
    path,
    hunkId: z.string().min(1).max(64),
    revision: z.string().min(1).max(128),
  }),
  restoreChange: z.object({ sessionId: z.string().min(1), path }),
  cancelQueued: z.object({ sessionId: z.string().min(1), queueId: z.string().min(1).max(128) }),
};

/** DI tokens of the session commands, one per `type` of the contract. */
export const SESSION_HANDLERS = {
  start: Symbol('session.start handler'),
  prompt: Symbol('session.prompt handler'),
  interrupt: Symbol('session.interrupt handler'),
  setModel: Symbol('session.setModel handler'),
  setPermissionMode: Symbol('session.setPermissionMode handler'),
  setLocale: Symbol('session.setLocale handler'),
  close: Symbol('session.close handler'),
  detach: Symbol('session.detach handler'),
  rewind: Symbol('session.rewindFiles handler'),
  rejectChange: Symbol('session.rejectChange handler'),
  restoreChange: Symbol('session.restoreChange handler'),
  cancelQueuedPrompt: Symbol('session.cancelQueuedPrompt handler'),
};
