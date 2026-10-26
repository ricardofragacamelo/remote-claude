/// The app's ring of engine extensions (plan 28, B-40, D-15; S-116; plan 16, D-09): a screen of one
/// engine only now exists — Claude's usage screen — so `lib/engines/` holds its code and
/// `app/engines.dart` imports it. What this test guards is **isolation**, not emptiness: nothing
/// outside the composition reaches into `engines/` directly, and nothing outside `main()` reaches
/// for the composition itself.
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
  test('S-116 · an engine lives under lib/engines/, never loose in the app', () {
    expect(Directory('lib/engines').existsSync(), isTrue);
    expect(dartFilesUnder('lib/engines'), isNotEmpty);
  });

  test('S-116 · only app/engines.dart reaches into an extension from outside engines/', () {
    final List<String> reaching = <String>[
      for (final String path in dartFilesUnder('lib'))
        if (path != 'lib/app/engines.dart' &&
            !path.startsWith('lib/engines/') &&
            File(
              path,
            ).readAsStringSync().contains(RegExp(r"import 'package:remote_claude/engines/")))
          path,
    ];

    expect(reaching, isEmpty);
  });

  test('S-116 · only main() reaches for the composition of the extensions', () {
    final List<String> reaching = <String>[
      for (final String path in dartFilesUnder('lib'))
        if (path != 'lib/main.dart' &&
            File(path).readAsStringSync().contains(
              RegExp(r"import 'package:remote_claude/app/engines\.dart"),
            ))
          path,
    ];

    expect(reaching, isEmpty);
  });
}
