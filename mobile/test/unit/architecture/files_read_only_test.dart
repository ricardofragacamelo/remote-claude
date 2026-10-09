@TestOn('vm')
library;

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Where the file browser lives. It reads the folder and never writes to it (plan 25, B-07).
const String filesFeature = 'lib/features/files';

/// A call that writes, through the `ApiClient` or Dio — a call or a tear-off — and the one route
/// that sends files.
final List<RegExp> writes = <RegExp>[
  RegExp(r'\.(post|put|patch|delete)\b'),
  RegExp('files/upload'),
];

/// Files that delete on the phone's own disk, never on the folder — each with why (plan 25, B-27).
const Map<String, String> phoneOnly = <String, String>{
  'lib/features/files/data/engines/app_temporary_files.dart':
      'deletes the temporary of a download in the app\'s cache, after the "save as"',
};

/// Every line of [directory] that writes, as `path:line: text`.
///
/// The server does not tell reading from writing apart by client, so the guarantee that the app
/// only reads is the absence of the code that would write (the discovery's principle 2): this is
/// that absence, checked.
List<String> writesUnder(Directory directory) {
  if (!directory.existsSync()) {
    return const <String>[];
  }

  final List<String> found = <String>[];
  final Iterable<File> sources = directory
      .listSync(recursive: true)
      .whereType<File>()
      .where((File file) => file.path.endsWith('.dart'))
      .where((File file) => !phoneOnly.containsKey(file.path));

  for (final File file in sources) {
    final List<String> lines = file.readAsLinesSync();
    for (int index = 0; index < lines.length; index++) {
      final String code = lines[index].split('//').first;
      if (writes.any((RegExp write) => write.hasMatch(code))) {
        found.add('${file.path}:${index + 1}: ${lines[index].trim()}');
      }
    }
  }

  return found;
}

void main() {
  test('every file let off the rule exists, and touches no route of the server', () {
    for (final String path in phoneOnly.keys) {
      final String code = File(path).readAsStringSync();
      expect(code, isNot(contains('api_client')), reason: path);
      expect(code, isNot(contains('package:dio')), reason: path);
      expect(code, isNot(contains(RegExp('[\'"]/files/'))), reason: path);
    }
  });

  test('the file browser, as it stands, only reads — S-13', () {
    expect(writesUnder(Directory(filesFeature)), isEmpty);
  });

  test('a write planted in the file browser is refused — S-12', () {
    const Map<String, String> planted = <String, String>{
      'post': 'void probe(dynamic api) => api.post("/files", body: null);',
      'put': 'void probe(dynamic api) => api.put("/files/content");',
      'patch': 'void probe(dynamic dio) => dio.patch("/files");',
      'delete': 'void probe(dynamic api) => api.delete("/files");',
      'tear-off': 'Object probe(dynamic api) => api.post;',
      'upload': "const String probe = '/files/upload';",
    };

    for (final MapEntry<String, String> each in planted.entries) {
      final File file = File('$filesFeature/data/_arch_write_probe.dart')
        ..createSync(recursive: true)
        ..writeAsStringSync(
          '// A deliberate violation. Written by a test, deleted by it.\n${each.value}\n',
        );
      addTearDown(() {
        if (file.existsSync()) {
          file.deleteSync();
        }
      });

      expect(writesUnder(Directory(filesFeature)), hasLength(1), reason: each.key);
      file.deleteSync();
    }
  });

  test('a write in a comment is not a write', () {
    final Directory scratch = Directory.systemTemp.createTempSync('files_read_only');
    addTearDown(() => scratch.deleteSync(recursive: true));
    File('${scratch.path}/a.dart').writeAsStringSync('// never api.post here\nconst int a = 1;\n');

    expect(writesUnder(scratch), isEmpty);
  });
}
