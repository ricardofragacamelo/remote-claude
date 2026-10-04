/// The test of an address, answering what the test says.
library;

import 'dart:async';

import 'package:remote_claude/features/connection/domain/entities/probe_result.dart';
import 'package:remote_claude/features/connection/domain/repositories/connection_probe.dart';

/// [ConnectionProbe] whose answer the test chooses, and holds until it says so.
class FakeConnectionProbe implements ConnectionProbe {
  /// What every test answers.
  ProbeResult answer = ProbeResult.ok;

  /// Holds the answer until completed — a test in flight.
  Completer<void>? gate;

  /// Every address asked, with its issuer.
  final List<(String, String)> asked = <(String, String)>[];

  @override
  Future<ProbeResult> probe({required String origin, required String issuer}) async {
    asked.add((origin, issuer));
    await gate?.future;
    return answer;
  }
}
