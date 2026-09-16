/** DI tokens of the identity adapters. They are infrastructure, and nothing outside wires them. */
export const IDENTITY_DISCOVERY = Symbol('OidcDiscovery');
export const IDENTITY_JWKS = Symbol('JwksCache');
