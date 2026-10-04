/// One test of an address at a time (plan 10, B-29).
library;

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/config/app_config_provider.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/features/connection/data/datasources/http_connection_probe.dart';
import 'package:remote_claude/features/connection/connection_providers.dart';
import 'package:remote_claude/features/connection/domain/entities/probe_result.dart';
import 'package:remote_claude/features/connection/presentation/providers/connection_test_controller.dart';

import '../../../support/builders/config.dart';
import '../../../support/fakes/fake_connection_probe.dart';
import '../../../support/fakes/recording_writer.dart';

void main() {
  late FakeConnectionProbe probe;
  late ProviderContainer container;

  setUp(() {
    probe = FakeConnectionProbe();
    container = ProviderContainer(
      overrides: <Override>[
        buildConfigProvider.overrideWithValue(aBuildConfig()),
        connectionProbeProvider.overrideWithValue(probe),
      ],
    );
    final ProviderSubscription<ConnectionTest> held = container.listen(
      connectionTestControllerProvider,
      (ConnectionTest? previous, ConnectionTest next) {},
    );
    addTearDown(() {
      held.close();
      container.dispose();
    });
  });

  test('S-107 · two taps while a test is out ask once; the answer is about that address', () async {
    probe.gate = Completer<void>();
    final ConnectionTestController tests = container.read(
      connectionTestControllerProvider.notifier,
    );

    final Future<void> first = tests.test('https://x.example');
    unawaited(tests.test('https://x.example'));
    expect(container.read(connectionTestControllerProvider).isTesting, isTrue);

    probe.gate!.complete();
    await first;

    expect(probe.asked, <(String, String)>[
      ('https://x.example', 'https://x.example/realms/remote-claude'),
    ]);
    expect(
      container.read(connectionTestControllerProvider),
      const ConnectionTest(origin: 'https://x.example', result: ProbeResult.ok),
    );
  });

  test('the wiring builds the HTTP test, with the app’s logger', () {
    final ProviderContainer real = ProviderContainer(
      overrides: <Override>[
        appLoggerProvider.overrideWithValue(
          AppLogger(
            context: const LogContext(appVersion: '1.0.0', platform: 'android'),
            writer: RecordingWriter().writer,
          ),
        ),
      ],
    );
    addTearDown(real.dispose);

    expect(real.read(connectionProbeProvider), isA<HttpConnectionProbe>());
  });
}
