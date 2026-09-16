/// Where the ephemeral stack of this run is, and what the shared scenario expects.
///
/// Flutter has no `.env` at runtime, so everything arrives through `--dart-define` — which is
/// also what makes this work on a real device, where the repository's files do not exist. The
/// values are written by `scripts/run-e2e-local.mjs`, the same script that brings the stack up for
/// the Playwright suite, so both ends test the same running system.
library;

import 'dart:convert';

import 'package:remote_claude/core/config/app_config.dart';

/// The configuration of the running stack.
///
/// It reads `appDefines` — the same list the entry point reads, so this run is configured exactly
/// the way a real build is.
///
/// @throws [ConfigurationError] naming every missing define, rather than failing later with a
///   connection refused that says nothing about the cause
AppConfig e2eConfig() => AppConfig.from(appDefines);

/// One scenario of `e2e/scenarios/`, handed over as JSON.
///
/// The file itself is never read here: on a device there is no repository to read it from. The
/// runner reads it and compiles it in, which keeps the two ends on one copy of the expectations —
/// see `e2e/scenarios/index.ts` for the other half.
class E2eScenario {
  E2eScenario(Map<String, Object?> raw)
    : id = raw['id']! as String,
      title = raw['title']! as String,
      user = (raw['user']! as Map<String, Object?>).cast<String, String>(),
      expect = raw['expect']! as Map<String, Object?>;

  /// Reads the scenario the runner compiled in.
  factory E2eScenario.fromDefine() {
    const String raw = String.fromEnvironment('RC_SCENARIO');

    if (raw.isEmpty) {
      throw StateError(
        'RC_SCENARIO is empty: run this through `pnpm test:e2e`, which brings the stack up and '
        'compiles the shared scenario in.',
      );
    }

    return E2eScenario(jsonDecode(raw) as Map<String, Object?>);
  }

  /// `S-nn` of docs/plans/00-bootstrap/scenarios.md.
  final String id;

  /// What the scenario proves, in one line.
  final String title;

  /// Credentials of a user of the local realm.
  final Map<String, String> user;

  /// What the run has to observe.
  final Map<String, Object?> expect;

  /// An expected value, as an integer.
  int integer(String key) => expect[key]! as int;

  /// An expected list of integers.
  List<int> integers(String key) => (expect[key]! as List<Object?>).cast<int>();
}
