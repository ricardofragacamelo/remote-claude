import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:logging/logging.dart';
import 'package:remote_claude/app/bootstrap.dart';
import 'package:remote_claude/core/config/app_config.dart';
import 'package:remote_claude/core/config/app_config_provider.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';

import '../../support/fakes/recording_writer.dart';

AppConfig config() => const AppConfig(
  apiBaseUrl: 'http://localhost:3000',
  wsUrl: 'ws://localhost:3000/ws',
  oidcIssuer: 'http://localhost:8180/realms/remote-claude',
  oidcClientId: 'remote-claude-mobile',
  oidcScopes: 'openid',
  oidcRedirectUrl: 'com.remoteclaude://callback',
  appVersion: '0.0.1',
);

void main() {
  group('levelFor', () {
    test('logs every I/O edge while developing', () {
      expect(levelFor(isRelease: false, debugRequested: false), Level.FINE);
    });

    test('is quieter in a release', () {
      expect(levelFor(isRelease: true, debugRequested: false), Level.INFO);
    });

    test('a user can turn debug back on without a new build', () {
      expect(levelFor(isRelease: true, debugRequested: true), Level.FINE);
    });
  });

  group('buildLogger', () {
    test('stamps the version and the platform on every line', () {
      final RecordingWriter recorder = RecordingWriter();
      final AppLogger logger = buildLogger(
        config: config(),
        platform: 'android',
        isRelease: false,
        writer: recorder.writer,
      );
      addTearDown(logger.dispose);

      logger.info('up', op: 'lifecycle.changed');

      expect(recorder.last['appVersion'], '0.0.1');
      expect(recorder.last['platform'], 'android');
      expect(recorder.last['service'], 'mobile');
    });

    test('a release logger drops the debug lines', () {
      final RecordingWriter recorder = RecordingWriter();
      final AppLogger logger = buildLogger(
        config: config(),
        platform: 'iOS',
        isRelease: true,
        writer: recorder.writer,
      );
      addTearDown(logger.dispose);

      logger.debug('quiet', op: 'ws.inbound');

      expect(recorder.lines, isEmpty);
    });

    test('writes to the developer console when nobody supplied a destination', () {
      final AppLogger logger = buildLogger(config: config(), platform: 'android', isRelease: false);
      addTearDown(logger.dispose);

      expect(() => logger.info('up', op: 'lifecycle.changed'), returnsNormally);
    });
  });

  group('installErrorHandlers', () {
    test('an uncaught Flutter error becomes a fatal line', () {
      final RecordingWriter recorder = RecordingWriter();
      final AppLogger logger = buildLogger(
        config: config(),
        platform: 'android',
        isRelease: false,
        writer: recorder.writer,
      );
      addTearDown(logger.dispose);

      final FlutterExceptionHandler? previous = FlutterError.onError;
      addTearDown(() => FlutterError.onError = previous);

      installErrorHandlers(logger);
      FlutterError.onError!(FlutterErrorDetails(exception: StateError('boom'), library: 'widgets'));

      expect(recorder.levels.last, 'fatal');
      expect(recorder.last['err'], contains('boom'));
    });

    test('an uncaught platform error becomes a fatal line and is swallowed', () {
      final RecordingWriter recorder = RecordingWriter();
      final AppLogger logger = buildLogger(
        config: config(),
        platform: 'android',
        isRelease: false,
        writer: recorder.writer,
      );
      addTearDown(logger.dispose);

      final FlutterExceptionHandler? previousFlutter = FlutterError.onError;
      final bool Function(Object, StackTrace)? previousPlatform =
          PlatformDispatcher.instance.onError;
      addTearDown(() {
        FlutterError.onError = previousFlutter;
        PlatformDispatcher.instance.onError = previousPlatform;
      });

      installErrorHandlers(logger);

      expect(PlatformDispatcher.instance.onError!(StateError('boom'), StackTrace.empty), isTrue);
      expect(recorder.levels.last, 'fatal');
    });
  });

  group('bootstrapOverrides', () {
    test('a container built with them holds the real configuration and logger', () {
      final RecordingWriter recorder = RecordingWriter();
      final AppLogger logger = buildLogger(
        config: config(),
        platform: 'android',
        isRelease: false,
        writer: recorder.writer,
      );
      addTearDown(logger.dispose);

      final ProviderContainer container = ProviderContainer(
        overrides: bootstrapOverrides(config: config(), logger: logger),
      );
      addTearDown(container.dispose);

      expect(container.read(appConfigProvider), config());
      expect(container.read(appLoggerProvider), same(logger));
    });

    test('a container without them refuses to start rather than inventing values', () {
      final ProviderContainer container = ProviderContainer();
      addTearDown(container.dispose);

      // Riverpod wraps whatever the provider threw; the point is that it refuses rather than
      // inventing a configuration nobody supplied.
      expect(() => container.read(appConfigProvider), throwsA(isA<Object>()));
      expect(() => container.read(appLoggerProvider), throwsA(isA<Object>()));
    });
  });
}
