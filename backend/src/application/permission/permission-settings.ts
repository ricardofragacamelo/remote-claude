/**
 * The numbers the installation puts on a permission, all from configuration.
 *
 * None of them is ever sent by a client. The timeout is the only protection there is against a
 * session that hangs for ever — the CLI imposes none of its own, measured — so a client that
 * could choose it could switch it off, and the extension is the same number by another name
 * ([D-09](../../../../docs/plans/01-live-session/decisions.md)).
 */
export interface PermissionSettings {
  /** How long a request waits for a human before the deadline denies it. */
  readonly timeoutMs: number;

  /** How much further out one extension pushes the deadline. */
  readonly extensionMs: number;

  /** How many extensions one request may have. The ceiling is hard. */
  readonly maxExtensions: number;

  /** The longest a rule granted in a session may live. */
  readonly ruleLifetimeMs: number;
}
