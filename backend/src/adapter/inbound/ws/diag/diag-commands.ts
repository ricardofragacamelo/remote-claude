import { z } from 'zod';

/** The payload of `diag.ping`. `sessionId` is optional: absent opens a diagnostic session. */
export const diagSchemas = {
  ping: z.object({ sessionId: z.string().optional(), nonce: z.string().min(1) }),
};

/** DI token of the diagnostic round trip. */
export const DIAG_HANDLERS = { ping: Symbol('diag.ping handler') };
