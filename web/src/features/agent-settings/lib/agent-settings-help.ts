import type { TFunction } from 'i18next';

import type { HelpExtra } from '@/shared/components/HelpPanel';
import { defaultsExtraFields } from '../store/defaults-extra-fields';

/**
 * The help of "Modelos e padrões" — the model, the modes, the effort and the thinking, written for
 * somebody who has never seen the product (plan 13, B-17); every key named in full. Besides these,
 * whatever the engine's own extension adds to the form — an output style, say — contributes its own
 * entry, read from the registry it filled (D-06).
 */
export function modelsSectionHelp(t: TFunction, engine: string): HelpExtra[] {
  const extra = defaultsExtraFields
    .entries()
    .filter((field) => field.engine === engine)
    .map((field) => field.help?.(t))
    .filter((entry): entry is HelpExtra => entry !== undefined);

  return [
    {
      id: 'model',
      heading: t('agentSettings.help.modelHeading'),
      body: t('agentSettings.help.modelBody'),
    },
    {
      id: 'modes',
      heading: t('agentSettings.help.modesHeading'),
      body: t('agentSettings.help.modesBody', { engine }),
    },
    {
      id: 'effort',
      heading: t('agentSettings.help.effortHeading'),
      body: t('agentSettings.help.effortBody'),
    },
    {
      id: 'thinking',
      heading: t('agentSettings.help.thinkingHeading'),
      body: t('agentSettings.help.thinkingBody'),
    },
    ...extra,
  ];
}
