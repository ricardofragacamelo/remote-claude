/** The kinds a rule can name (plan 28, B-31) — the wizard's own copy of the domain's
 * `RULE_KINDS`, most used first (S-187's own step 1): the web never imports the backend's. */
export const NEW_RULE_KINDS = [
  'shell',
  'file.edit',
  'file.write',
  'file.read',
  'search',
  'web.fetch',
  'web.search',
  'mcp',
  'agent',
  'file.delete',
  'file.move',
] as const;

export type NewRuleKind = (typeof NEW_RULE_KINDS)[number];

export function isNewRuleKind(value: string): value is NewRuleKind {
  return (NEW_RULE_KINDS as readonly string[]).includes(value);
}

/** What the pattern step asks for, by kind (plan 15, B-27, step 2) — never a tool name of an
 * engine's own, only the canonical subject the grammar reads (D-20). */
export type SubjectField = 'command' | 'path' | 'domain' | 'mcp' | 'none';

const SUBJECT_FIELD: Readonly<Record<NewRuleKind, SubjectField>> = {
  shell: 'command',
  'file.read': 'path',
  'file.edit': 'path',
  'file.write': 'path',
  'file.delete': 'path',
  'file.move': 'path',
  search: 'none',
  'web.fetch': 'domain',
  'web.search': 'none',
  mcp: 'mcp',
  agent: 'none',
};

/** The field the pattern step shows for this kind — `none` skips the step's subject input
 * entirely, offering only the whole kind (D-09's own `broad`, S-186). */
export function subjectFieldOf(kind: NewRuleKind): SubjectField {
  return SUBJECT_FIELD[kind];
}

/** Whether this kind's command/path field may also be written as a prefix (`:*`) — `shell` only
 * (D-08): a path kind only offers the exact path or the whole kind, never `:*`, because the
 * matcher's token boundary does not mean what a person reading "starts with" would expect. */
export function allowsPrefix(kind: NewRuleKind): boolean {
  return kind === 'shell';
}
