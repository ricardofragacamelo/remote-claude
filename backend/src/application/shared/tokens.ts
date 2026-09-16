/**
 * DI tokens for the concepts that live in `domain/shared/`.
 *
 * A port declares its own token next to it; these two are the exception only because the ports
 * themselves are domain concepts and the domain knows nothing about a container. The token is a
 * `Symbol` so two ports can never collide by name.
 */
export const CLOCK = Symbol('Clock');
export const ID_GENERATOR = Symbol('IdGenerator');
