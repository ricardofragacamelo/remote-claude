/**
 * DI tokens of the push adapter's own pieces.
 *
 * They are `Symbol`s for the usual reason — two tokens can never collide by name — and they live
 * beside the adapter rather than in `application/`, because nothing above this folder has any
 * business holding an access token cache or a catalogue that only a push uses.
 */
export const PUSH_ACCESS_TOKENS = Symbol('PushAccessTokenCache');
export const PUSH_TEXT = Symbol('PushTranslator');
