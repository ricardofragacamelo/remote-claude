import type { AnalyzableRule, PermissionRule } from '@domain/permission';
import type { UserId } from '@domain/auth';
import type { RuleFolderResolver } from './ports/rule-folder-resolver.port';

/**
 * [rule] as the pure analysis ([15 · B-15]) needs it, with `folderReachable` filled in by the one
 * thing only the application layer can ask: the allowlist, through {@link RuleFolderResolver},
 * never touching disk ([15 · B-10]'s own `folderReachable`, computed the same way — one function,
 * not two that drift).
 */
export function toAnalyzable(
  rule: PermissionRule,
  folders: RuleFolderResolver,
  userId: UserId,
): AnalyzableRule {
  return {
    id: rule.id,
    engine: rule.engine,
    pattern: rule.pattern,
    ruleContent: rule.ruleContent,
    decision: rule.decision,
    scope: rule.scope,
    projectPath: rule.projectPath,
    breadth: rule.breadth,
    folderReachable:
      rule.scope === 'project' && rule.projectPath !== null
        ? folders.reaches(rule.projectPath, userId)
        : null,
  };
}
