import { decodeProtectedHeader } from 'jose';

/**
 * The second place allowed to reach for `jose`, and for something that is not identity.
 *
 * It signs the assertion its own provider exchanges for an access token. The rule it is excepted
 * from is about OIDC knowledge spreading, not about a crypto primitive.
 */
export const decode = decodeProtectedHeader;
