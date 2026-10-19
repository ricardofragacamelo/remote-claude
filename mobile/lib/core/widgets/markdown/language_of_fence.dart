/// The language a code fence of markdown is highlighted as (plan 26, B-08) — a port of the web's
/// `languageOfFence`/`LANGUAGES` (`web/src/features/editor/lib/languages.ts`), so a fence names the
/// same 32 languages on both ends and colours the same way.
library;

/// A fence with no language, or one the app does not highlight.
const String plainText = 'plaintext';

/// The 32 languages the app highlights, by the id a fence names them with, with the proper name
/// each goes by. Mirrors the web's `LANGUAGES` exactly — one entry added or dropped there is a gap
/// here, caught by `render:check`.
const Map<String, String> languages = <String, String>{
  'bat': 'Batch',
  'c': 'C',
  'cpp': 'C++',
  'csharp': 'C#',
  'css': 'CSS',
  'dart': 'Dart',
  'dockerfile': 'Dockerfile',
  'go': 'Go',
  'graphql': 'GraphQL',
  'html': 'HTML',
  'ini': 'INI',
  'java': 'Java',
  'javascript': 'JavaScript',
  'json': 'JSON',
  'kotlin': 'Kotlin',
  'less': 'Less',
  'lua': 'Lua',
  'markdown': 'Markdown',
  'perl': 'Perl',
  'php': 'PHP',
  'powershell': 'PowerShell',
  'python': 'Python',
  'r': 'R',
  'ruby': 'Ruby',
  'rust': 'Rust',
  'scss': 'SCSS',
  'shell': 'Shell',
  'sql': 'SQL',
  'swift': 'Swift',
  'typescript': 'TypeScript',
  'xml': 'XML',
  'yaml': 'YAML',
};

/// A fence name the web also resolves by extension (`languages.ts`'s `BY_EXTENSION`) — a shorthand
/// people actually write, like ` ```ts ` or ` ```py `.
const Map<String, String> _byExtension = <String, String>{
  'bat': 'bat',
  'c': 'c',
  'cc': 'cpp',
  'cjs': 'javascript',
  'cmd': 'bat',
  'cpp': 'cpp',
  'cs': 'csharp',
  'css': 'css',
  'dart': 'dart',
  'go': 'go',
  'gql': 'graphql',
  'graphql': 'graphql',
  'h': 'c',
  'hpp': 'cpp',
  'htm': 'html',
  'html': 'html',
  'ini': 'ini',
  'java': 'java',
  'js': 'javascript',
  'json': 'json',
  'jsonc': 'json',
  'jsx': 'javascript',
  'kt': 'kotlin',
  'less': 'less',
  'lua': 'lua',
  'md': 'markdown',
  'mjs': 'javascript',
  'mts': 'typescript',
  'php': 'php',
  'pl': 'perl',
  'ps1': 'powershell',
  'py': 'python',
  'r': 'r',
  'rb': 'ruby',
  'rs': 'rust',
  'scss': 'scss',
  'sh': 'shell',
  'sql': 'sql',
  'svg': 'xml',
  'swift': 'swift',
  'toml': 'ini',
  'ts': 'typescript',
  'tsx': 'typescript',
  'xml': 'xml',
  'yaml': 'yaml',
  'yml': 'yaml',
  'zsh': 'shell',
};

/// A fence name the web resolves by itself, not by extension (`languages.ts`'s `BY_NAME`).
const Map<String, String> _byName = <String, String>{
  'dockerfile': 'dockerfile',
  'makefile': 'shell',
  '.bashrc': 'shell',
  '.zshrc': 'shell',
  '.env': 'ini',
};

/// Where `re_highlight` (plan 26, D-10) registers a language of [languages] under a different id
/// than the web's — `bat`→`dos`, `html`→`xml`, `shell`→`bash` — the rest match by their own id.
const Map<String, String> _engineIds = <String, String>{
  'bat': 'dos',
  'html': 'xml',
  'shell': 'bash',
};

String _extensionOf(String name) {
  final int dot = name.lastIndexOf('.');
  if (dot <= 0) {
    return plainText;
  }
  return _byExtension[name.substring(dot + 1)] ?? plainText;
}

String _byItsName(String name) => _byName[name] ?? _extensionOf(name);

/// The language a fence names — ` ```ts `, ` ```python ` — by the names its files go by, or the id
/// itself. Unknown, it is [plainText].
String languageOfFence(String fence) {
  final String name = fence.trim().toLowerCase();

  if (name.isEmpty) {
    return plainText;
  }

  final String byExtension = _extensionOf('code.$name');
  if (byExtension != plainText) {
    return byExtension;
  }

  // The id itself — ```python, ```typescript — or a file the name is, like ```dockerfile.
  return languages.containsKey(name) ? name : _byItsName(name);
}

/// The id `re_highlight` registers [language] (one of [languages]' keys, or [plainText]) under.
String highlightEngineId(String language) => _engineIds[language] ?? language;
