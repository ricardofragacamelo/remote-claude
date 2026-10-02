import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { matchesSearch } from '@/features/commands';
import type { PaletteModeProps } from '@/features/commands';
import { CommandEmpty, CommandGroup, CommandItem } from '@/shared/components/ui/command';
import { useOfferedChoice } from '../hooks/useEditorUiState';

/**
 * A choice of the editor in the palette — a language, an encoding, a line ending, the indentation:
 * the same options the status bar item opens (B-37), the one in use marked.
 */
export function EditorChoiceMode({ query, pick }: PaletteModeProps): React.JSX.Element {
  const { t } = useTranslation();
  const choice = useOfferedChoice();
  const options = choice.options.filter((option) => matchesSearch(option.label, query));

  if (options.length === 0) {
    return <CommandEmpty>{t('editor.choice.none')}</CommandEmpty>;
  }

  return (
    <CommandGroup heading={t(choice.titleKey)}>
      {options.map((option) => (
        <CommandItem
          key={option.id}
          value={option.id}
          onSelect={() => {
            pick(option.run);
          }}
        >
          <Check className={option.current ? 'size-4' : 'size-4 opacity-0'} aria-hidden />
          {option.label}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
