import { describe, expect, it } from 'vitest';

import { PushTranslator } from '@shared/i18n/push-translator';

const translator = new PushTranslator();

describe('the push catalogue', () => {
  // S-17: the payload goes out already rendered, in the language the device registered.
  it('answers in the language the device registered — S-17', () => {
    const english = translator.permission('en', { toolName: 'Bash' });
    const portuguese = translator.permission('pt-BR', { toolName: 'Bash' });

    expect(english.title).not.toBe(portuguese.title);
    expect(english.body).toContain('Bash');
    expect(portuguese.body).toContain('Bash');
  });

  // S-18: a notification with no words is worse than one in the wrong language.
  it.each(['fr', 'pt', 'en-GB', ''])('falls back to en for %s, never to a key — S-18', (locale) => {
    const text = translator.permission(locale, { toolName: 'Bash' });

    expect(text).toEqual(translator.permission('en', { toolName: 'Bash' }));
    expect(text.title).not.toContain('push.');
    expect(text.title).not.toBe('');
    expect(text.body).not.toBe('');
  });

  it('interpolates by name, so word order can differ between languages', () => {
    expect(translator.permission('pt-BR', { toolName: 'Write' }).body).toContain('Write');
  });

  // A hole where a value should have been is the nastiest failure this catalogue can have.
  it('leaves no placeholder unfilled when the value is given', () => {
    const text = translator.permission('en', { toolName: 'Bash' });

    expect(text.body).not.toContain('{{');
  });

  it('says the same thing twice — the instance is reused, not rebuilt', () => {
    expect(translator.permission('en', { toolName: 'Bash' })).toEqual(
      translator.permission('en', { toolName: 'Bash' }),
    );
  });
});
