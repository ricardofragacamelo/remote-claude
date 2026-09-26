import 'dart:async';

import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/log_operations.dart';
import 'package:remote_claude/core/session/sign_out_hooks.dart';

import '../../../support/fakes/recording_writer.dart';

void main() {
  late RecordingWriter recorder;
  late AppLogger logger;
  late SignOutHooks hooks;

  setUp(() {
    recorder = RecordingWriter();
    logger = AppLogger(
      context: const LogContext(appVersion: '0.0.1', platform: 'android'),
      writer: recorder.writer,
    );
    hooks = SignOutHooks();
  });

  test('runs every registered step, in the order they were registered', () async {
    final List<String> ran = <String>[];
    hooks
      ..register('a', () async => ran.add('a'))
      ..register('b', () async => ran.add('b'));

    await hooks.run(logger);

    expect(ran, <String>['a', 'b']);
  });

  test('registering under the same name replaces the step', () async {
    final List<String> ran = <String>[];
    hooks
      ..register('a', () async => ran.add('first'))
      ..register('a', () async => ran.add('second'));

    await hooks.run(logger);

    expect(ran, <String>['second']);
  });

  test('a step that was unregistered does not run', () async {
    bool ran = false;
    hooks
      ..register('a', () async => ran = true)
      ..unregister('a');

    await hooks.run(logger);

    expect(ran, isFalse);
  });

  // S-88 — no network: the step fails, it is a warn, and signing out goes on.
  test('a step that fails is a warn, and the next one still runs', () async {
    bool ran = false;
    hooks
      ..register('offline', () async => throw StateError('no route'))
      ..register('next', () async => ran = true);

    await hooks.run(logger);

    expect(ran, isTrue);
    final Map<String, Object?> line = recorder.withOp(LogOp.authToken).single;
    expect(line['level'], 'warn');
    expect(line['step'], 'offline');
  });

  test('a step that hangs is given up on, and the sign-out does not wait for it', () {
    fakeAsync((FakeAsync async) {
      bool done = false;
      hooks.register('hangs', () => Completer<void>().future);

      unawaited(hooks.run(logger).then((_) => done = true));
      async.elapse(signOutStepTimeout);

      expect(done, isTrue);
      expect(recorder.withOp(LogOp.authToken).single['step'], 'hangs');
    });
  });
}
