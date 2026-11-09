import type { PermissionRule } from '@domain/permission';
import type { UserId } from '@domain/auth';
import type { RuleFolderResolver } from './ports/rule-folder-resolver.port';

/**
 * Whether a `project` rule's own folder is still in the caller's allowlist — `null` on an `always`
 * rule, which has none to check (B-10, `folderReachable`), shared by the listing and the single-rule
 * read so the two never drift (B-22).
 */
export function folderReachableFor(
  rule: PermissionRule,
  userId: UserId,
  folders: RuleFolderResolver,
): boolean | null {
  return rule.scope === 'project' && rule.projectPath !== null
    ? folders.reaches(rule.projectPath, userId)
    : null;
}
