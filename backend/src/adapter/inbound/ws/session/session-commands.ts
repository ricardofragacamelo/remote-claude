import { z } from 'zod';

import { PERMISSION_MODES } from '@domain/session';

/** The payloads the session commands carry, as the contract declares them. */
export const sessionSchemas = {
  session: z.object({ sessionId: z.string().min(1) }),
  start: z.object({
    workspacePath: z.string().min(1),
    model: z.string().min(1).optional(),
    permissionMode: z.enum(PERMISSION_MODES).optional(),
    resumeSessionId: z.string().min(1).optional(),
  }),
  prompt: z.object({ sessionId: z.string().min(1), text: z.string().min(1) }),
  model: z.object({ sessionId: z.string().min(1), model: z.string().min(1) }),
  mode: z.object({ sessionId: z.string().min(1), mode: z.enum(PERMISSION_MODES) }),
  locale: z.object({ locale: z.enum(['en', 'pt-BR']) }),
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
};
