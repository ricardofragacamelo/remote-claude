/// The app's ring of engine extensions, empty on purpose (plan 28, B-40, D-15; S-116): nothing is
/// written into `lib/engines/`, the composition registers nothing, and no file of the core reaches
/// for either — so the empty folder changes nothing the app builds.
@TestOn('vm')
library;

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// A probe `import_rules_test.dart` writes into the real tree for the length of its own test, to
/// give `import_lint` a real violation to refuse — never code of the app, gone by the time that
/// test's `tearDown` runs. The two tests race on the same files when `flutter test` runs them as
/// two files in parallel; this is what tells that transient probe from a file this test should
/// actually fail on.
bool isArchProbe(String path) => path.contains('/_arch_');

/// Every Dart file under [path], relative to the module, none of them a probe of another test.
List<String> dartFilesUnder(String path) {
  final Directory directory = Directory(path);
  if (!directory.existsSync()) {
    return const <String>[];
  }

  return directory
      .listSync(recursive: true)
      .whereType<File>()
      .map((File file) => file.path)
      .where((String path) => path.endsWith('.dart') && !isArchProbe(path))
      .toList();
}

void main() {
  test('S-116 · lib/engines/ holds no code: the app has no screen of one engine only', () {
    expect(Directory('lib/engines').existsSync(), isTrue);
    expect(dartFilesUnder('lib/engines'), isEmpty);
  });

  test('S-116 · the composition registers nothing beyond the core: it imports nothing', () {
    final List<String> lines = File('lib/app/engines.dart').readAsLinesSync();

    expect(lines.where((String line) => line.startsWith('import ')), isEmpty);
    expect(lines.where((String line) => line.isNotEmpty && !line.startsWith('///')), <String>[
      'library;',
    ]);
  });

  test('S-116 · no file of the app imports an extension or the composition of them', () {
    final List<String> reaching = <String>[
      for (final String path in dartFilesUnder('lib'))
        if (File(path).readAsStringSync().contains(
          RegExp(r"import 'package:remote_claude/(engines/|app/engines\.dart)"),
        ))
          path,
    ];

    expect(reaching, isEmpty);
  });
}
