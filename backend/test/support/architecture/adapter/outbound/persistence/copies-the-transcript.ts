// A deliberate violation: a repository reaching for what reads a conversation, to keep a copy of it
// in PostgreSQL — S-28.
import { TRANSCRIPT_STORE } from '../../../application/transcript/ports/transcript-store.port';

export const copied = TRANSCRIPT_STORE;
