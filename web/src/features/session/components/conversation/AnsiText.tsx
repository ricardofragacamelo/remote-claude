import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils';
import { ansiSegments } from '../../lib/ansi';
import type { AnsiTone } from '../../lib/ansi';
import { ScrollingPre } from './ScrollingPre';

/** How much of an output a row shows before "show all": the end of it, which is what matters most. */
export const OUTPUT_CEILING = 4_000;

/** The token of the theme each colour of the terminal is drawn with. */
const TONE_CLASS: Readonly<Record<AnsiTone, string>> = {
  danger: 'text-destructive',
  success: 'text-success',
  warning: 'text-warning',
  accent: 'text-primary',
  muted: 'text-muted-foreground',
};

/**
 * Output of a terminal, coloured by role and never as HTML (plan 08, B-18): a hyperlink of the
 * terminal, a title and any sequence this build does not know are dropped (S-78). Above the ceiling
 * it shows the end, with "show all" (S-79).
 */
export function AnsiText({ output }: { readonly output: string }): React.JSX.Element {
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  const cut = !all && output.length > OUTPUT_CEILING;
  const shown = cut ? output.slice(-OUTPUT_CEILING) : output;

  return (
    <div className="flex flex-col gap-1">
      {cut && (
        <Button
          variant="outline"
          className="self-start"
          onClick={() => {
            setAll(true);
          }}
        >
          {t('sessions.output.showAll', { count: output.length })}
        </Button>
      )}
      <ScrollingPre>
        {ansiSegments(shown).map((segment, index) => (
          <span
            key={index}
            className={cn(
              segment.tone !== null && TONE_CLASS[segment.tone],
              segment.bold && 'font-ui-strong',
            )}
          >
            {segment.text}
          </span>
        ))}
      </ScrollingPre>
    </div>
  );
}
