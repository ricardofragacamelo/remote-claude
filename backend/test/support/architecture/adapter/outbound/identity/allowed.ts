import { decodeProtectedHeader } from 'jose';

/** The one place that may know what OIDC is. */
export const decode = decodeProtectedHeader;
