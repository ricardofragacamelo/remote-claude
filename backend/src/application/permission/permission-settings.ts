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

  /**
   * How long a **question** of the agent waits instead — reading and choosing take longer than saying
   * yes or no, and the person may be answering from a phone
   * ([24 · D-07](../../../../docs/plans/24-structured-questions/decisions.md#f1--backend)). Extended
   * by the same step, to the same ceiling.
   */
  readonly questionTimeoutMs: number;

  /** How much further out one extension pushes the deadline. */
  readonly extensionMs: number;

  /** How many extensions one request may have. The ceiling is hard. */
  readonly maxExtensions: number;

  /** The longest a rule granted in a session may live. */
  readonly ruleLifetimeMs: number;

  /** How long a `project` or `always` rule lives when nobody said how long. */
  readonly ruleDefaultLifetimeMs: number;

  /**
   * The longest a `project` or `always` rule may live. Asking for more is refused, never cut.
   *
   * The configuration bounds it too — the boot refuses a ceiling past what the code allows — so
   * no environment variable can turn a rule into a permanent grant
   * ([D-02](../../../../docs/plans/03-rules-and-audit/decisions.md)).
   */
  readonly ruleMaxLifetimeMs: number;

  /**
   * How long a `deny` rule lives when nobody said how long — its own, longer, default.
   *
   * A forgotten `deny` recuses something the owner would allow today; it never exposes anything, so
   * it earns a longer leash than `allow`, never the same one
   * ([15 · D-04](../../../../docs/plans/15-rules-management/decisions.md#d-04--deny-sem-validade)).
   */
  readonly ruleDenyDefaultLifetimeMs: number;

  /** The longest a `deny` rule may live. Asking for more is refused, never cut. */
  readonly ruleDenyMaxLifetimeMs: number;

  /**
   * How long after a revocation it may still be undone with no second step
   * ([15 · D-11](../../../../docs/plans/15-rules-management/decisions.md#d-11--desfazer-a-revogação)).
   * Past it, the rule does not come back by restoring — duplicating it through the assistant, with
   * its own second step, is the path.
   */
  readonly ruleRestoreWindowMs: number;
}
