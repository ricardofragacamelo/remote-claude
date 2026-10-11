import i18next from 'i18next';
import type { i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { isRecord } from '@/shared/lib/json';
import { agentNameOf } from './agent-names';
import en from './locales/en.json';
import ptBR from './locales/pt-BR.json';

export { agentNameIn, nameAgents } from './agent-names';
export type { AgentDirectory, NamedAgent } from './agent-names';

/** The languages this product speaks. `en` is the source of truth and the fallback. */
export const LOCALES = ['en', 'pt-BR'] as const;

export type Locale = (typeof LOCALES)[number];

/** Whether a string names a language this build has a catalogue for. */
export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * The language for this visitor.
 *
 * Asked for → `en` → the key itself. Never an empty string and never `null`: a missing translation
 * should look like a missing translation, not like a broken layout.
 */
export function resolveLocale(preferred: readonly string[]): Locale {
  for (const candidate of preferred) {
    if (isLocale(candidate)) {
      return candidate;
    }

    const language = candidate.split('-')[0];
    const match = LOCALES.find((locale) => locale.split('-')[0] === language);
    if (match !== undefined) {
      return match;
    }
  }

  return 'en';
}

/** The placeholder every text that names the coding agent uses — never the agent's own name. */
const AGENT = 'agent';

/**
 * Builds the i18n instance.
 *
 * Interpolation is **named** (`{{path}}`), never positional: word order changes between languages,
 * and a positional placeholder cannot survive that. See docs/architecture/shared/02-i18n.md.
 *
 * A text that names the agent says `{{agent}}`, and the backend's errors carry the engine in
 * `params.engine`, never its name (plan 28, B-13). So an `{{agent}}` nobody passed is filled here, for
 * every `t(error.messageKey, error.params)` of every screen: with the `displayName` of
 * `params.engine` as `GET /engines` gave it, its id when it is not listed, the default engine's name
 * when the text names none — and, before anything is known, a word that names no agent in particular.
 * Any other variable left out stays as it was written, as without the handler.
 */
export function createI18n(locale: Locale): i18n {
  const instance = i18next.createInstance();

  void instance.use(initReactI18next).init({
    resources: { en: { translation: en }, 'pt-BR': { translation: ptBR } },
    lng: locale,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
    missingInterpolationHandler: (_text: string, match: RegExpExecArray, options: unknown) =>
      missingVariable(instance, match, options),
  });

  return instance;
}

/**
 * What a `{{variable}}` nobody passed becomes. i18next hands over the match and the options of the
 * `t()` call — its `params` —, typed as the options of the instance, which they are not.
 */
function missingVariable(instance: i18n, match: RegExpExecArray, options: unknown): string {
  if (match[1]?.trim() !== AGENT) {
    return match[0];
  }

  return (
    agentNameOf(isRecord(options) ? options['engine'] : undefined) ??
    instance.t('engine.name.fallback')
  );
}
