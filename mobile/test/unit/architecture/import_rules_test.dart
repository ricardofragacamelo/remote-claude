@TestOn('vm')
@Timeout(Duration(minutes: 3))
library;

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Files written into `lib/` for the length of one test, each violating exactly one rule.
///
/// A rule that nobody has watched fail is a rule nobody knows is connected. The backend and the
/// web front learned this the hard way — two tools reported success without inspecting a single
/// file — so every rule here is proved by a deliberate violation.
const Map<String, String> violations = <String, String>{
  'lib/features/session/domain/entities/_arch_flutter.dart':
      "import 'package:flutter/material.dart';\n",
  'lib/features/session/domain/entities/_arch_http.dart': "import 'package:dio/dio.dart';\n",
  'lib/features/session/domain/entities/_arch_riverpod.dart':
      "import 'package:riverpod_annotation/riverpod_annotation.dart';\n",
  'lib/features/session/domain/entities/_arch_riverpod_flutter.dart':
      "import 'package:flutter_riverpod/flutter_riverpod.dart';\n",
  'lib/features/session/domain/entities/_arch_socket.dart':
      "import 'package:web_socket_channel/web_socket_channel.dart';\n",
  'lib/features/session/presentation/pages/_arch_reaches_data.dart':
      "import 'package:remote_claude/features/session/data/mappers/pong_mapper.dart';\n",
  'lib/features/session/presentation/pages/_arch_cross_feature.dart':
      "import 'package:remote_claude/features/auth/domain/entities/auth_session.dart';\n",
  'lib/features/auth/presentation/pages/_arch_cross_feature.dart':
      "import 'package:remote_claude/features/session/domain/entities/pong.dart';\n",
  'lib/core/network/_arch_core_knows_features.dart':
      "import 'package:remote_claude/features/session/domain/entities/pong.dart';\n",
};

/// The rule each violation is expected to trip.
const Map<String, String> expectedRules = <String, String>{
  '_arch_flutter.dart': 'domain_is_pure_flutter',
  '_arch_http.dart': 'domain_is_pure_http',
  '_arch_riverpod.dart': 'domain_is_pure_riverpod',
  '_arch_riverpod_flutter.dart': 'domain_is_pure_riverpod_flutter',
  '_arch_socket.dart': 'domain_is_pure_socket',
  '_arch_reaches_data.dart': 'presentation_cannot_reach_data',
  '_arch_core_knows_features.dart': 'core_cannot_import_features',
};

Future<ProcessResult> runImportLint() =>
    Process.run('dart', <String>['run', 'import_lint'], workingDirectory: Directory.current.path);

void main() {
  test('the import rules pass over the code as it stands', () async {
    final ProcessResult result = await runImportLint();

    expect(result.exitCode, 0, reason: '${result.stdout}');
  });

  test('every rule refuses the import it exists to refuse', () async {
    for (final MapEntry<String, String> entry in violations.entries) {
      final File file = File(entry.key)..createSync(recursive: true);
      file.writeAsStringSync(
        '// A deliberate violation. Written by a test, deleted by it.\n'
        '${entry.value}',
      );
      addTearDown(() {
        if (file.existsSync()) {
          file.deleteSync();
        }
      });
    }

    final ProcessResult result = await runImportLint();
    final String output = '${result.stdout}';

    for (final MapEntry<String, String> rule in expectedRules.entries) {
      expect(output, contains(rule.value), reason: 'rule ${rule.value} did not fire');
    }

    // Both directions of the cross-feature ban, which share no file name.
    expect(output, contains('no_cross_feature_internals_auth'));
    expect(output, contains('no_cross_feature_internals_session'));
  });
  test('the analyzer refuses print() and dynamic, the Dart halves of S-68 and S-69', () async {
    final File file = File('lib/_arch_analyzer_probe.dart')..createSync(recursive: true);
    addTearDown(() {
      if (file.existsSync()) {
        file.deleteSync();
      }
    });

    file.writeAsStringSync(
      '// A deliberate violation. Written by a test, deleted by it.\nvoid probe(dynamic anything) {\n  print(anything);\n}\n',
    );

    final ProcessResult result = await Process.run('flutter', <String>[
      'analyze',
    ], workingDirectory: Directory.current.path);

    expect(result.exitCode, isNot(0));
    expect('${result.stdout}', contains('avoid_print'));
  });
}
