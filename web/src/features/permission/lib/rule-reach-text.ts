import type { TFunction } from 'i18next';

import { isKnownKind, kindShortName } from '@/shared/lib/tool-label';
import type { PermissionRule } from '../types/rule';

/** What the "tipo" column says: a label, and — only for `mcp` — the server and tool apart (S-162). */
export interface RuleTypeText {
  readonly label: string;
  readonly mcp?: { readonly server: string; readonly tool: string };

  /** A kind this build has no name for: the canonical pattern is shown beside it, as text (S-162). */
  readonly unknown: boolean;
}

/**
 * The server and the tool of an `mcp` reach — `mcp(server:tool)`'s own canonical grammar, read from
 * the content the server already parsed, never reparsed from the pattern here.
 */
function mcpServerAndTool(content: string): { server: string; tool: string } {
  const sep = content.indexOf(':');
  return sep === -1
    ? { server: content, tool: '*' }
    : { server: content.slice(0, sep), tool: content.slice(sep + 1) };
}

/**
 * How the "tipo" column names a rule's kind — the short name this build knows, `mcp`'s own
 * server/tool, or the generic name with the pattern left beside it as text for a kind this version
 * does not recognise (S-162: a canonical kind added after this build shipped still lists, never
 * breaks the screen).
 */
export function ruleTypeText(rule: PermissionRule, t: TFunction): RuleTypeText {
  if (rule.kind === null) {
    return { label: kindShortName(null, t), unknown: false };
  }

  if (rule.kind === 'mcp' && rule.reach?.content != null) {
    return {
      label: kindShortName(rule.kind, t),
      mcp: mcpServerAndTool(rule.reach.content),
      unknown: false,
    };
  }

  return { label: kindShortName(rule.kind, t), unknown: !isKnownKind(rule.kind) };
}
