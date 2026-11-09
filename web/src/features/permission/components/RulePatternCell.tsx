import { ClipboardCopy } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/shared/components/IconButton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { useCopy } from '@/shared/hooks/useCopy';

/** The pattern, in the canonical grammar, exactly as granted — truncated, with the full text in a
 * tooltip and a button to copy it (S-161). Never reparsed here: it is shown, not read. */
export function RulePatternCell({ pattern }: { readonly pattern: string }): React.JSX.Element {
  const { t } = useTranslation();
  const copy = useCopy(pattern);

  return (
    <span className="flex max-w-[20ch] items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <code className="truncate font-mono text-ui-xs">{pattern}</code>
        </TooltipTrigger>
        <TooltipContent>
          <code className="font-mono text-ui-xs">{pattern}</code>
        </TooltipContent>
      </Tooltip>
      <IconButton
        icon={ClipboardCopy}
        label={t('rules.table.copyPattern')}
        onClick={() => {
          copy.copy();
        }}
      />
    </span>
  );
}
