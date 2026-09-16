/**
 * Base of every domain error.
 *
 * The three fields are abstract on purpose: a new error without a `code`, a `messageKey` and
 * `params` does not compile. `code` is what client logic branches on, `messageKey` is what the
 * client translates, and `params` is what it interpolates — the backend never sends prose.
 *
 * See docs/architecture/shared/04-errors-and-http.md. Nothing here knows what HTTP is; the
 * mapping from an error to a status lives in one place, in the adapter layer.
 */
export abstract class DomainError extends Error {
  /** Stable identifier the client branches on. Changing one is a breaking change. */
  abstract readonly code: string;

  /** Translation key the client resolves. Never a sentence. */
  abstract readonly messageKey: string;

  /** Interpolation values for {@link messageKey}. Never carries a secret. */
  readonly params: Readonly<Record<string, unknown>>;

  /**
   * @param message technical description, in English, for the log — never shown to a user
   * @param params interpolation values for the message key
   */
  protected constructor(message: string, params: Readonly<Record<string, unknown>> = {}) {
    super(message);
    this.name = new.target.name;
    this.params = params;
  }
}
