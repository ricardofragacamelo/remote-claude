/// Testing an address before saving it (plan 10, B-29): the server's health and its login, one test
/// at a time (S-107).
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/core/config/app_config_provider.dart';
import 'package:remote_claude/core/config/connection_origin.dart';
import 'package:remote_claude/features/connection/connection_providers.dart';
import 'package:remote_claude/features/connection/domain/entities/probe_result.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'connection_test_controller.g.dart';

/// Where testing an address stands.
class ConnectionTest extends Equatable {
  const ConnectionTest({this.isTesting = false, this.origin, this.result});

  /// A test is out, and nothing else is sent until it answers.
  final bool isTesting;

  /// The address the last answer is about.
  final String? origin;
  final ProbeResult? result;

  @override
  List<Object?> get props => <Object?>[isTesting, origin, result];
}

/// The test of the address screen. Disposed with it.
@riverpod
class ConnectionTestController extends _$ConnectionTestController {
  @override
  ConnectionTest build() => const ConnectionTest();

  /// Tests [origin] — once, however many taps, while a test is out.
  Future<void> test(String origin) async {
    if (state.isTesting) {
      return;
    }

    state = ConnectionTest(isTesting: true, origin: origin);
    final String issuer = ConnectionEndpoints.of(
      origin,
      ref.read(buildConfigProvider).realmPath,
    ).issuer;
    final ProbeResult result = await ref
        .read(connectionProbeProvider)
        .probe(origin: origin, issuer: issuer);

    if (ref.mounted) {
      state = ConnectionTest(origin: origin, result: result);
    }
  }
}
