import { baseName } from './paths';

/** The language of a text with no highlighting. */
export const PLAIN_TEXT = 'plaintext';

/**
 * The languages the editor highlights, by their editor id, with the name each one goes by. Names of
 * programming languages are proper names and the same in every language of the interface; the one
 * that is not — plain text — is translated where it shows.
 *
 * Highlighting only: a grammar colours the text and runs nothing — completion, diagnostics and the
 * rest of a language's intelligence stay out by the user's decision (07 · D-09).
 */
export const LANGUAGES: Readonly<Record<string, string>> = {
  bat: 'Batch',
  c: 'C',
  cpp: 'C++',
  csharp: 'C#',
  css: 'CSS',
  dart: 'Dart',
  dockerfile: 'Dockerfile',
  go: 'Go',
  graphql: 'GraphQL',
  html: 'HTML',
  ini: 'INI',
  java: 'Java',
  javascript: 'JavaScript',
  json: 'JSON',
  kotlin: 'Kotlin',
  less: 'Less',
  lua: 'Lua',
  markdown: 'Markdown',
  perl: 'Perl',
  php: 'PHP',
  powershell: 'PowerShell',
  python: 'Python',
  r: 'R',
  ruby: 'Ruby',
  rust: 'Rust',
  scss: 'SCSS',
  shell: 'Shell',
  sql: 'SQL',
  swift: 'Swift',
  typescript: 'TypeScript',
  xml: 'XML',
  yaml: 'YAML',
};

const BY_EXTENSION: Readonly<Record<string, string>> = {
  bat: 'bat',
  c: 'c',
  cc: 'cpp',
  cjs: 'javascript',
  cmd: 'bat',
  cpp: 'cpp',
  cs: 'csharp',
  css: 'css',
  dart: 'dart',
  go: 'go',
  gql: 'graphql',
  graphql: 'graphql',
  h: 'c',
  hpp: 'cpp',
  htm: 'html',
  html: 'html',
  ini: 'ini',
  java: 'java',
  js: 'javascript',
  json: 'json',
  jsonc: 'json',
  jsx: 'javascript',
  kt: 'kotlin',
  less: 'less',
  lua: 'lua',
  md: 'markdown',
  mjs: 'javascript',
  mts: 'typescript',
  php: 'php',
  pl: 'perl',
  ps1: 'powershell',
  py: 'python',
  r: 'r',
  rb: 'ruby',
  rs: 'rust',
  scss: 'scss',
  sh: 'shell',
  sql: 'sql',
  svg: 'xml',
  swift: 'swift',
  toml: 'ini',
  ts: 'typescript',
  tsx: 'typescript',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  zsh: 'shell',
};

const BY_NAME: Readonly<Record<string, string>> = {
  dockerfile: 'dockerfile',
  makefile: 'shell',
  '.bashrc': 'shell',
  '.zshrc': 'shell',
  '.env': 'ini',
};

/** The language a file is highlighted as, from its name — plain text when nothing says otherwise. */
export function languageOf(path: string): string {
  const name = baseName(path).toLowerCase();
  const byName = BY_NAME[name];

  if (byName !== undefined) {
    return byName;
  }

  const dot = name.lastIndexOf('.');
  return dot <= 0 ? PLAIN_TEXT : (BY_EXTENSION[name.slice(dot + 1)] ?? PLAIN_TEXT);
}

/**
 * The encodings a file can be reopened or saved with — the ones the backend converts (07 · D-04),
 * by the canonical name it uses: lower case, with no `-` nor `_`.
 */
export const ENCODINGS: Readonly<Record<string, string>> = {
  utf8: 'UTF-8',
  utf16le: 'UTF-16 LE',
  utf16be: 'UTF-16 BE',
  windows1252: 'Windows 1252',
  iso88591: 'ISO 8859-1',
  iso885915: 'ISO 8859-15',
  shiftjis: 'Shift JIS',
  gbk: 'GBK',
};

/** An encoding by the canonical name the backend uses — `Windows-1252` is `windows1252`. */
export function canonicalEncoding(encoding: string): string {
  return encoding.toLowerCase().replace(/[-_]/g, '');
}

/** How an encoding is named on screen — its own name when this list does not know it. */
export function encodingName(encoding: string): string {
  return ENCODINGS[canonicalEncoding(encoding)] ?? encoding;
}
