import { ruleTemplateCatalog } from './rule-templates';
import type { RuleTemplate } from './rule-templates';

/**
 * `GET /permission-rules/templates` — the catalog of pre-built rules, with the reach and the
 * breadth of each one already read ([15 · B-17], D-16). Read-only, the same for every caller: no
 * repository, no user.
 */
export class ListRuleTemplatesUseCase {
  execute(): readonly RuleTemplate[] {
    return ruleTemplateCatalog();
  }
}
