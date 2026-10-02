import { describe, expect, it } from 'vitest';

import {
  PLAIN_TEXT,
  canonicalEncoding,
  encodingName,
  languageOf,
} from '@/features/editor/lib/languages';

describe('the language a file is highlighted as', () => {
  it.each([
    ['src/main.ts', 'typescript'],
    ['App.TSX', 'typescript'],
    ['package.json', 'json'],
    ['README.md', 'markdown'],
    ['Dockerfile', 'dockerfile'],
    ['.env', 'ini'],
    ['notes', PLAIN_TEXT],
    ['.gitignore', PLAIN_TEXT],
    ['data.unknown', PLAIN_TEXT],
  ])('%s is %s', (path, language) => {
    expect(languageOf(path)).toBe(language);
  });
});

describe('the encodings', () => {
  it('are named the backend way, and on screen by their usual name', () => {
    expect(canonicalEncoding('Windows-1252')).toBe('windows1252');
    expect(canonicalEncoding('Shift_JIS')).toBe('shiftjis');
    expect(encodingName('utf8')).toBe('UTF-8');
    expect(encodingName('ISO-8859-1')).toBe('ISO 8859-1');
    expect(encodingName('koi8-r')).toBe('koi8-r');
  });
});
