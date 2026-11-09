import {
  describeReach,
  parseRulePattern,
  ruleBreadth,
  type PermissionDecision,
  type PermissionRuleBreadth,
  type RuleReachDescription,
} from '@domain/permission';

/** A translated label — the client resolves `messageKey`, never this server. */
export interface RuleTemplateMessage {
  readonly messageKey: string;
  readonly params: Readonly<Record<string, never>>;
}

/** One rule a template grants, already read through the domain's own grammar and width. */
export interface RuleTemplateRule {
  /** In the canonical grammar, exactly as the catalog wrote it. */
  readonly pattern: string;
  readonly decision: PermissionDecision;
  readonly reach: RuleReachDescription;
  readonly breadth: PermissionRuleBreadth;
}

/** A named bundle of rules a person applies in one step — plan 15, B-17, D-16. */
export interface RuleTemplate {
  readonly id: string;
  readonly name: RuleTemplateMessage;
  readonly description: RuleTemplateMessage;
  readonly rules: readonly RuleTemplateRule[];
}

interface RuleTemplateDraft {
  readonly id: string;
  readonly name: RuleTemplateMessage;
  readonly description: RuleTemplateMessage;
  readonly rules: readonly { readonly pattern: string; readonly decision: PermissionDecision }[];
}

/**
 * The initial set of [D-16](../../../../docs/plans/15-rules-management/decisions.md#d-16--onde-moram-os-modelos-de-regra-e-quais-entram).
 * Canonical, with `engine` null — every entry reaches on any engine that has the `kind` — and a
 * single catalog, not one per engine.
 *
 * Every `messageKey` here is a literal, never built from `id`: `i18n-check.mjs` proves a key is
 * used by reading `messageKey: '…'` out of the backend's own source — a key only a template
 * literal could produce is a key the checker could never find (docs/architecture/shared/02-i18n.md).
 *
 * "Leitura do repositório" is deliberately absent: a whole `file.read` does not confine its reach
 * to a folder, and most reads never reach a rule at all — the CLI answers them on its own.
 */
const RULE_TEMPLATE_CATALOG: readonly RuleTemplateDraft[] = [
  {
    id: 'run-tests',
    name: { messageKey: 'permission.ruleTemplate.runTestsName', params: {} },
    description: { messageKey: 'permission.ruleTemplate.runTestsDescription', params: {} },
    rules: [
      { pattern: 'shell(pnpm test:*)', decision: 'allow' },
      { pattern: 'shell(npm test:*)', decision: 'allow' },
      { pattern: 'shell(yarn test:*)', decision: 'allow' },
    ],
  },
  {
    id: 'git-read-only',
    name: { messageKey: 'permission.ruleTemplate.gitReadOnlyName', params: {} },
    description: { messageKey: 'permission.ruleTemplate.gitReadOnlyDescription', params: {} },
    rules: [
      { pattern: 'shell(git status:*)', decision: 'allow' },
      { pattern: 'shell(git diff:*)', decision: 'allow' },
      { pattern: 'shell(git log:*)', decision: 'allow' },
      { pattern: 'shell(git show:*)', decision: 'allow' },
      { pattern: 'shell(git branch --list:*)', decision: 'allow' },
    ],
  },
  {
    id: 'lint-and-format',
    name: { messageKey: 'permission.ruleTemplate.lintAndFormatName', params: {} },
    description: { messageKey: 'permission.ruleTemplate.lintAndFormatDescription', params: {} },
    rules: [
      { pattern: 'shell(pnpm lint:*)', decision: 'allow' },
      { pattern: 'shell(pnpm format:*)', decision: 'allow' },
      { pattern: 'shell(pnpm typecheck:*)', decision: 'allow' },
    ],
  },
  {
    id: 'block-network',
    name: { messageKey: 'permission.ruleTemplate.blockNetworkName', params: {} },
    description: { messageKey: 'permission.ruleTemplate.blockNetworkDescription', params: {} },
    rules: [
      { pattern: 'web.fetch', decision: 'deny' },
      { pattern: 'web.search', decision: 'deny' },
      { pattern: 'shell(curl:*)', decision: 'deny' },
      { pattern: 'shell(wget:*)', decision: 'deny' },
    ],
  },
  {
    id: 'block-destructive-git',
    name: { messageKey: 'permission.ruleTemplate.blockDestructiveGitName', params: {} },
    description: {
      messageKey: 'permission.ruleTemplate.blockDestructiveGitDescription',
      params: {},
    },
    rules: [
      { pattern: 'shell(git push --force:*)', decision: 'deny' },
      { pattern: 'shell(git push -f:*)', decision: 'deny' },
      { pattern: 'shell(git reset --hard:*)', decision: 'deny' },
      { pattern: 'shell(git clean:*)', decision: 'deny' },
    ],
  },
  {
    id: 'block-bulk-delete',
    name: { messageKey: 'permission.ruleTemplate.blockBulkDeleteName', params: {} },
    description: { messageKey: 'permission.ruleTemplate.blockBulkDeleteDescription', params: {} },
    rules: [
      { pattern: 'shell(rm -rf:*)', decision: 'deny' },
      { pattern: 'shell(rm -fr:*)', decision: 'deny' },
    ],
  },
];

/**
 * The catalog, read once through the same grammar and width every other rule answers to (S-133)
 * — a pattern outside the canonical grammar fails here, at import, not at the first request.
 */
const RULE_TEMPLATES: readonly RuleTemplate[] = RULE_TEMPLATE_CATALOG.map((draft) => ({
  id: draft.id,
  name: draft.name,
  description: draft.description,
  rules: draft.rules.map((rule) => {
    const pattern = parseRulePattern(rule.pattern);

    return {
      pattern: rule.pattern,
      decision: rule.decision,
      reach: describeReach(pattern, rule.decision, null),
      breadth: ruleBreadth(pattern),
    };
  }),
}));

/** `GET /permission-rules/templates` — the whole catalog, read-only ([15 · B-17]). */
export function ruleTemplateCatalog(): readonly RuleTemplate[] {
  return RULE_TEMPLATES;
}

/** Whether `id` is a template this server knows — what a `templateId` is checked against (S-36). */
export function isKnownRuleTemplateId(id: string): boolean {
  return RULE_TEMPLATES.some((template) => template.id === id);
}
