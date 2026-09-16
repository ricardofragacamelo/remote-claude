import 'package:flutter_test/flutter_test.dart';
import 'package:logging/logging.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/log_operations.dart';

import '../../../support/fakes/recording_writer.dart';

void main() {
  late RecordingWriter recorder;
  late AppLogger logger;

  setUp(() {
    recorder = RecordingWriter();
    logger = AppLogger(
      context: const LogContext(appVersion: '0.0.1', platform: 'android'),
      writer: recorder.writer,
    );
  });

  tearDown(() => logger.dispose());

  test('writes one line per call, at the level asked for', () {
    logger.debug('a', op: LogOp.wsInbound);
    logger.info('b', op: LogOp.authToken);
    logger.warn('c', op: LogOp.wsConnection);
    logger.error('d', op: LogOp.httpResponse);
    logger.fatal('e', op: LogOp.lifecycleChanged);

    expect(recorder.levels, <String>['debug', 'info', 'warn', 'error', 'fatal']);
  });

  test('stamps the op on every line', () {
    logger.debug('ws frame sent', op: LogOp.wsOutbound);

    expect(recorder.last['op'], LogOp.wsOutbound);
    expect(recorder.last['msg'], 'ws frame sent');
  });

  test('carries the extra fields a call site supplies', () {
    logger.info('signed in', op: LogOp.authToken, fields: <String, Object?>{'userId': 'u-1'});

    expect(recorder.last['userId'], 'u-1');
  });

  test('serialises the error of an error line', () {
    logger.error('boom', op: LogOp.httpResponse, err: const FormatException('bad'));

    expect(recorder.last['err'], contains('bad'));
  });

  test('drops what is below the level of the build', () {
    final RecordingWriter quiet = RecordingWriter();
    final AppLogger release = AppLogger(
      context: const LogContext(appVersion: '0.0.1', platform: 'android'),
      writer: quiet.writer,
      level: Level.INFO,
    );
    addTearDown(release.dispose);

    release.debug('not this one', op: LogOp.wsInbound);
    release.info('this one', op: LogOp.authToken);

    expect(quiet.records.length, 1);
    expect(quiet.last['msg'], 'this one');
  });

  test('a new context applies to the lines that follow it', () {
    logger.updateContext(logger.context.copyWith(sessionId: 'ses-1'));
    logger.info('after', op: LogOp.authToken);

    expect(recorder.last['sessionId'], 'ses-1');
  });

  test('stops writing once disposed', () async {
    await logger.dispose();
    logger.info('gone', op: LogOp.authToken);

    expect(recorder.lines, isEmpty);
  });
}
