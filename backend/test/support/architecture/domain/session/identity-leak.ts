import { decodeProtectedHeader } from 'jose';

/** Identity knowledge outside its adapter — forbidden by `identity-is-isolated`. */
export const leaked = decodeProtectedHeader;
