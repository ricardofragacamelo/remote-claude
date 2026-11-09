import { useTranslation } from 'react-i18next';

import { ruleTypeText } from '../lib/rule-reach-text';
import type { PermissionRule } from '../types/rule';

/**
 * What a rule answers to, by its `kind` — `mcp`'s own server and tool apart, and a kind this build
 * does not recognise named generically with its canonical pattern beside it as text, never
 * reinterpreted (S-162: a kind added after this build shipped still lists, instead of breaking).
 */
export function RuleTypeCell({ rule }: { readonly rule: PermissionRule }): React.JSX.Element {
  const { t } = useTranslation();
  const text = ruleTypeText(rule, t);

  if (text.mcp !== undefined) {
    return (
      <span className="flex flex-col">
        <span>{text.label}</span>
        <span className="font-mono text-ui-xs text-muted-foreground">
          {t('rules.table.mcpServerTool', { server: text.mcp.server, tool: text.mcp.tool })}
        </span>
      </span>
    );
  }

  if (text.unknown && rule.kind !== null) {
    return (
      <span className="flex flex-col">
        <span>{text.label}</span>
        <span className="font-mono text-ui-xs text-muted-foreground">{rule.kind}</span>
      </span>
    );
  }

  return <span>{text.label}</span>;
}
