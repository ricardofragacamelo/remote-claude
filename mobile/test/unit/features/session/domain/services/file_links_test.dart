/// `fileLinkOf`, against the table the web and the app share (plan 26, B-10).
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/services/file_links.dart';

void main() {
  late Map<String, Object?> fixture;

  setUpAll(() {
    fixture =
        jsonDecode(File('../test/fixtures/file-links.json').readAsStringSync())
            as Map<String, Object?>;
  });

  test('S-69 · reads a path of the folder the same way the web does', () {
    final String folder = fixture['folder']! as String;
    for (final Object? entry in fixture['matches']! as List<Object?>) {
      final Map<String, Object?> expected = entry! as Map<String, Object?>;
      final String text = expected['text']! as String;

      expect(
        fileLinkOf(text, folder),
        FileLink(path: expected['path']! as String, line: expected['line'] as int?),
        reason: text,
      );
    }
  });

  test('S-70 · leaves everything else as text, the same way the web does', () {
    final String folder = fixture['folder']! as String;
    for (final Object? entry in fixture['nonMatches']! as List<Object?>) {
      final String text = entry! as String;
      expect(fileLinkOf(text, folder), isNull, reason: text);
    }
  });
}
