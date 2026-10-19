/// A port of the web's `languageOfFence`/`LANGUAGES` (plan 26, B-08).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/widgets/markdown/language_of_fence.dart';

void main() {
  test('the 32 languages of the web are all known', () {
    expect(languages.length, 32);
    expect(languages['typescript'], 'TypeScript');
    expect(languages['dart'], 'Dart');
  });

  test('a fence named by its own id resolves to itself', () {
    for (final String id in languages.keys) {
      expect(languageOfFence(id), id);
    }
  });

  test('a fence named by a common shorthand resolves by extension', () {
    expect(languageOfFence('ts'), 'typescript');
    expect(languageOfFence('tsx'), 'typescript');
    expect(languageOfFence('js'), 'javascript');
    expect(languageOfFence('jsx'), 'javascript');
    expect(languageOfFence('py'), 'python');
    expect(languageOfFence('rb'), 'ruby');
    expect(languageOfFence('rs'), 'rust');
    expect(languageOfFence('kt'), 'kotlin');
    expect(languageOfFence('cs'), 'csharp');
    expect(languageOfFence('cc'), 'cpp');
    expect(languageOfFence('h'), 'c');
    expect(languageOfFence('hpp'), 'cpp');
    expect(languageOfFence('htm'), 'html');
    expect(languageOfFence('sh'), 'shell');
    expect(languageOfFence('zsh'), 'shell');
    expect(languageOfFence('yml'), 'yaml');
    expect(languageOfFence('toml'), 'ini');
    expect(languageOfFence('md'), 'markdown');
    expect(languageOfFence('cmd'), 'bat');
  });

  test('a fence named by itself, not by extension — dockerfile, makefile', () {
    expect(languageOfFence('dockerfile'), 'dockerfile');
    expect(languageOfFence('makefile'), 'shell');
  });

  test('blank and unknown fences are plain text', () {
    expect(languageOfFence(''), plainText);
    expect(languageOfFence('   '), plainText);
    expect(languageOfFence('klingon'), plainText);
  });

  test('a fence name is case- and space-insensitive', () {
    expect(languageOfFence(' TypeScript '), 'typescript');
  });

  test('D-10 · `re_highlight` registers some of the 32 under a different id', () {
    expect(highlightEngineId('bat'), 'dos');
    expect(highlightEngineId('html'), 'xml');
    expect(highlightEngineId('shell'), 'bash');
    expect(highlightEngineId('python'), 'python');
    expect(highlightEngineId(plainText), plainText);
  });
}
