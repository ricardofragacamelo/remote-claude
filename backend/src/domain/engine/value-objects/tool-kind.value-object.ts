/**
 * The canonical kind of a tool call — what every client draws by, and never the engine's own name of
 * the tool (ADR-025).
 *
 * Open on purpose: a kind a client does not know is drawn by the generic line (`other`), and never
 * breaks it. Each kind makes sense for more than one engine, or is generic (plan 27 · D-10);
 * the table that classifies the engine's names into these is its adapter's, and is exhaustive.
 */
export type ToolKind = string;

/**
 * The kinds the core knows today (plan 28, F2). `web` is two, because a rule of permission tells a
 * page fetched from a search made (F5); `shell.output` reads what a command already printed.
 */
export const KNOWN_TOOL_KINDS = [
  'file.read',
  'file.edit',
  'file.write',
  'file.delete',
  'file.move',
  'search',
  'shell',
  'shell.output',
  'web.fetch',
  'web.search',
  'mcp',
  'agent',
  'question',
  'plan',
  'tasks',
  'other',
] as const;

/** One of the kinds the core knows. */
export type KnownToolKind = (typeof KNOWN_TOOL_KINDS)[number];

/** Whether [kind] is one the core knows — what it does not know, it treats as `other`. */
export function isKnownToolKind(kind: string): kind is KnownToolKind {
  return (KNOWN_TOOL_KINDS as readonly string[]).includes(kind);
}
