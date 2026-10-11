import { afterEach, describe, expect, it } from 'vitest';

import {
  LOCALES,
  agentNameIn,
  createI18n,
  isLocale,
  nameAgents,
  resolveLocale,
} from '@/shared/i18n';
import en from '@/shared/i18n/locales/en.json';
import ptBR from '@/shared/i18n/locales/pt-BR.json';

/** Every leaf of a catalogue, as dotted keys. */
function keysOf(node: unknown, prefix = ''): string[] {
  if (typeof node !== 'object' || node === null) {
    return [prefix];
  }

  return Object.entries(node).flatMap(([key, value]) =>
    keysOf(value, prefix === '' ? key : `${prefix}.${key}`),
  );
}

/** Named placeholders used by a string. */
function paramsOf(value: string): string[] {
  return [...value.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1] ?? '').sort();
}

/** Every leaf value of a catalogue, by key. */
function leavesOf(node: unknown, prefix = ''): Map<string, string> {
  if (typeof node !== 'object' || node === null) {
    return new Map([[prefix, String(node)]]);
  }

  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(node)) {
    for (const [k, v] of leavesOf(value, prefix === '' ? key : `${prefix}.${key}`)) {
      out.set(k, v);
    }
  }

  return out;
}

describe('the catalogues', () => {
  it('have exactly the same keys in both languages', () => {
    expect(keysOf(ptBR).sort()).toEqual(keysOf(en).sort());
  });

  it('interpolate the same named parameters in both', () => {
    const english = leavesOf(en);

    for (const [key, translated] of leavesOf(ptBR)) {
      expect(paramsOf(translated), key).toEqual(paramsOf(english.get(key) ?? ''));
    }
  });

  it('never interpolate by position, which no translator could reorder', () => {
    for (const [key, value] of leavesOf(en)) {
      expect(value, key).not.toMatch(/\{\{\d+\}\}/);
    }
  });

  it('nest no deeper than three segments', () => {
    for (const key of keysOf(en)) {
      expect(key.split('.'), key).toHaveLength(3);
    }
  });
});

describe('resolveLocale', () => {
  it.each([
    [['pt-BR'], 'pt-BR'],
    [['en'], 'en'],
    [['pt'], 'pt-BR'],
    [['pt-PT'], 'pt-BR'],
    [['en-GB'], 'en'],
    [['de', 'pt-BR'], 'pt-BR'],
    [['de'], 'en'],
    [[], 'en'],
  ])('resolves %j to %s', (preferred, expected) => {
    expect(resolveLocale(preferred)).toBe(expected);
  });
});

describe('isLocale', () => {
  it.each(LOCALES)('recognises %s', (locale) => {
    expect(isLocale(locale)).toBe(true);
  });

  it('does not recognise a language with no catalogue', () => {
    expect(isLocale('de')).toBe(false);
  });
});

describe('createI18n', () => {
  it('translates in the language it was built for', () => {
    expect(createI18n('pt-BR').t('common.action.retry')).toBe('Tentar de novo');
  });

  it('interpolates by name', () => {
    expect(createI18n('en').t('common.error.traceLabel', { traceId: 'abc' })).toBe('Trace abc');
  });

  it('falls back to English rather than to an empty string', () => {
    const instance = createI18n('pt-BR');

    expect(instance.t('diagnostics.ping.title', { lng: 'de' })).toBe('Round trip');
  });

  it('answers the key itself when there is no translation at all', () => {
    expect(createI18n('en').t('nothing.like.this')).toBe('nothing.like.this');
  });
});

describe('the agent a text names — plan 28, B-13, S-26', () => {
  const DIRECTORY = {
    defaultEngine: 'claude',
    engines: [
      { id: 'claude', displayName: 'Claude' },
      { id: 'other', displayName: 'Other Agent' },
    ],
  };

  afterEach(() => {
    nameAgents(null);
  });

  it('fills the agent of an error with the name of its engine, as the server lists it', () => {
    nameAgents(DIRECTORY);
    const t = createI18n('en').t;

    expect(t('session.error.agentUnavailable', { engine: 'other' })).toBe(
      'Other Agent stopped responding on this machine.',
    );
    expect(createI18n('pt-BR').t('transcript.error.agentTimeout', { engine: 'claude' })).toBe(
      'O Claude demorou demais para ler o histórico. Tente de novo.',
    );
  });

  it('names an engine the server does not list by its id', () => {
    nameAgents(DIRECTORY);

    expect(createI18n('en').t('engine.error.capabilityUnavailable', { engine: 'unlisted' })).toBe(
      'unlisted cannot do this.',
    );
  });

  it('names the default engine when the text names none', () => {
    nameAgents(DIRECTORY);

    expect(createI18n('en').t('session.error.agentTimeout')).toBe(
      'Claude took too long to answer. Try again.',
    );
  });

  it('says "the agent" before any engine is known — never a name it knows', () => {
    expect(createI18n('en').t('session.error.agentUnavailable')).toBe(
      'The agent stopped responding on this machine.',
    );
    expect(createI18n('pt-BR').t('session.error.agentUnavailable')).toBe(
      'O agente parou de responder nesta máquina.',
    );
  });

  it('keeps an agent the call passed, and any other variable left out as it was written', () => {
    nameAgents(DIRECTORY);
    const t = createI18n('en').t;

    expect(t('engine.error.notInstalled', { agent: 'Named', engine: 'other' })).toBe(
      'Named is not installed on this machine.',
    );
    expect(t('common.error.traceLabel')).toBe('Trace {{traceId}}');
  });

  it('reads the directory in the order a person is best served by', () => {
    expect(agentNameIn(DIRECTORY, 'other')).toBe('Other Agent');
    expect(agentNameIn(DIRECTORY, 'unlisted')).toBe('unlisted');
    expect(agentNameIn(DIRECTORY, '')).toBe('Claude');
    expect(agentNameIn(DIRECTORY, 7)).toBe('Claude');
    expect(agentNameIn({ defaultEngine: null, engines: [] }, undefined)).toBeNull();
    expect(agentNameIn(null, 'claude')).toBe('claude');
    expect(agentNameIn(null, undefined)).toBeNull();
  });
});

describe('the texts of the core name the engine of the session — plan 28, B-39, S-113', () => {
  const DIRECTORY = {
    defaultEngine: 'claude',
    engines: [
      { id: 'claude', displayName: 'Claude Code' },
      { id: 'codex', displayName: 'Codex' },
    ],
  };

  /**
   * What still names one engine in the core's catalogue, and why: the screen of that engine's
   * settings, its link and its commands move to its extension with B-38, and the versions of the
   * installation become the engines' own description with B-37.
   */
  const LEFT_TO_LATER =
    /^(claudeConfig|claudeSettings|engines)\.|^navigation\.entry\.claude$|^settings\.links\.claude$|^command\.claude\.|^about\.version\./;

  afterEach(() => {
    nameAgents(null);
  });

  it('says the displayName of the session’s engine, in en and in pt-BR', () => {
    nameAgents(DIRECTORY);

    expect(createI18n('en').t('agentPanel.screen.purpose', { engine: 'codex' })).toBe(
      'Talk to Codex about this folder: start conversations, follow and approve what it does, and review what it changed.',
    );
    expect(createI18n('pt-BR').t('agentPanel.screen.purpose', { engine: 'codex' })).toBe(
      'Converse com o Codex sobre esta pasta: abra conversas, acompanhe e aprove o que ele faz e revise o que ele alterou.',
    );
    expect(
      createI18n('pt-BR').t('sessions.status.item', {
        engine: 'codex',
        status: 'ok',
        model: 'm',
        cost: '$0',
      }),
    ).toBe('Codex: ok · m · $0 — abrir o painel');
  });

  it('says the default engine’s displayName where the text names no session', () => {
    nameAgents(DIRECTORY);

    expect(createI18n('en').t('workbench.agent.label')).toBe('Claude Code');
    expect(createI18n('en').t('command.agent.newConversation')).toBe(
      'Claude Code: New conversation',
    );
    expect(createI18n('pt-BR').t('workbench.sessions.label')).toBe('Sessões do Claude Code');
  });

  it.each([
    ['en', en],
    ['pt-BR', ptBR],
  ])('writes no engine’s name in a text of the core, in %s', (_locale, catalogue) => {
    const named = [...leavesOf(catalogue)].filter(
      ([key, value]) => !LEFT_TO_LATER.test(key) && /(?<![-\w.])Claude\b/.test(value),
    );

    expect(named).toEqual([]);
  });
});
