import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { Command, CommandEmpty, CommandInput, CommandList } from '@/shared/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { useRegistry } from '@/shared/hooks/useRegistry';
import { afterClose } from '../hooks/execute-command';
import { modeFor } from '../hooks/palette-filter';
import { paletteModes, usePalette } from '../store/palette.store';

/** What the field says while no mode matches what is typed. */
const NO_MODE_PLACEHOLDER = 'palette.dialog.placeholder';

/**
 * The command palette: one field over everything the app can do by name.
 *
 * What is typed first picks the mode — `>` the commands, and any mode another plan registers — and
 * the options are that mode's (plan 06, S-124). It is the combobox and listbox pattern, announced
 * to a screen reader as the active option moves; `Esc` closes it and gives the focus back to whoever
 * had it (S-125).
 */
export function CommandPalette(): React.JSX.Element {
  const { t } = useTranslation();
  const open = usePalette((state) => state.open);
  const value = usePalette((state) => state.value);
  const entered = usePalette((state) => state.mode);
  const setValue = usePalette((state) => state.setValue);
  const close = usePalette((state) => state.close);
  const modes = useRegistry(paletteModes);
  const match = modeFor(modes, value, entered);

  const pick = useCallback(
    (action: () => void) => {
      close();
      afterClose(action);
    },
    [close],
  );

  const prefixes = modes
    .flatMap((mode) => (mode.prefix === undefined || mode.prefix === '' ? [] : [mode.prefix]))
    .join(' ');

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          close();
        }
      }}
    >
      <DialogContent className="top-[12%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">{t('palette.dialog.title')}</DialogTitle>
        <DialogDescription className="sr-only">{t('palette.dialog.description')}</DialogDescription>
        {/* `label` names the field: cmdk points the input's `aria-labelledby` at it. */}
        <Command shouldFilter={false} loop label={t('palette.dialog.input')}>
          <CommandInput
            value={value}
            onValueChange={setValue}
            placeholder={t(match?.mode.placeholderKey ?? NO_MODE_PLACEHOLDER)}
          />
          <CommandList aria-label={t('palette.dialog.results')}>
            {match === null ? (
              <CommandEmpty>{t('palette.dialog.noMode', { prefixes })}</CommandEmpty>
            ) : (
              <match.mode.component query={match.query} pick={pick} />
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
