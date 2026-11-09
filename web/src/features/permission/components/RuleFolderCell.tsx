import { useTranslation } from 'react-i18next';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import type { PermissionRule } from '../types/rule';

/** "Em todo lugar" for `always`, or the folder's name with its full path in a tooltip for `project`. */
export function RuleFolderCell({ rule }: { readonly rule: PermissionRule }): React.JSX.Element {
  const { t } = useTranslation();

  if (rule.scope === 'always' || rule.projectPath === null) {
    return <span>{t('rules.scope.always')}</span>;
  }

  const name = rule.projectPath.split('/').filter(Boolean).pop() ?? rule.projectPath;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="truncate">{name}</span>
      </TooltipTrigger>
      <TooltipContent>
        <code className="font-mono text-ui-xs">{rule.projectPath}</code>
      </TooltipContent>
    </Tooltip>
  );
}
