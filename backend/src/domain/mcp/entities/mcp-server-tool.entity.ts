/**
 * What a server itself says about one of its tools — third-party text, never ours (plan 13, B-25).
 * `undefined` means the server said nothing of that trait; B-26's `riskHint` is the one place that
 * turns "said nothing" into a decision (D-13), never this type.
 */
export interface McpServerToolAnnotations {
  readonly readOnly?: boolean;
  readonly destructive?: boolean;
  readonly openWorld?: boolean;
}

/** One tool a server offered while a test connected to it. */
export interface McpServerTool {
  readonly name: string;
  readonly description: string | null;
  readonly annotations: McpServerToolAnnotations;
}
