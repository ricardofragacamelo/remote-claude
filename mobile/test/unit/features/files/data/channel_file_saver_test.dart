import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/log_operations.dart';
import 'package:remote_claude/features/files/data/engines/channel_file_saver.dart';
import 'package:remote_claude/features/files/domain/ports/file_saver.dart';

import '../../../../support/fakes/recording_writer.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late RecordingWriter log;
  late AppLogger logger;
  final List<MethodCall> calls = <MethodCall>[];

  setUp(() {
    calls.clear();
    log = RecordingWriter();
    logger = AppLogger(
      context: const LogContext(appVersion: '0.0.1', platform: 'android'),
      writer: log.writer,
    );
    addTearDown(logger.dispose);
  });

  /// The platform's end, answering [answer] — or throwing it.
  void platform(Object? Function(MethodCall call) answer) {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel(saveChannelName),
      (MethodCall call) async {
        calls.add(call);
        return answer(call);
      },
    );
    addTearDown(
      () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(const MethodChannel(saveChannelName), null),
    );
  }

  Future<SaveOutcome> save() => ChannelFileSaver(logger: logger).save(
    temporaryPath: '/cache/download-1/report.pdf',
    name: 'report.pdf',
    mimeType: 'application/pdf',
  );

  test('S-119 · the channel takes the temporary, the name and the type, and says saved', () async {
    platform((MethodCall _) => 'saved');

    expect(await save(), isA<Saved>());
    expect(calls.single.method, 'save');
    expect(calls.single.arguments, <String, String>{
      'path': '/cache/download-1/report.pdf',
      'name': 'report.pdf',
      'type': 'application/pdf',
    });
  });

  test('S-119 · the person closed the dialog: cancelled', () async {
    platform((MethodCall _) => 'cancelled');

    expect(await save(), isA<SaveCancelled>());
  });

  test('S-121 · the platform failing — a full disk, a refused place — is a failed save', () async {
    platform((MethodCall _) => throw PlatformException(code: 'SAVE_FAILED', message: 'ENOSPC'));

    final SaveOutcome outcome = await save();

    expect((outcome as SaveFailed).reason, 'SAVE_FAILED: ENOSPC');
    expect(log.records.last['reason'], 'SAVE_FAILED: ENOSPC');
  });

  test('an answer it does not know, and a platform with no channel, are failed saves', () async {
    platform((MethodCall _) => 'maybe');
    expect(((await save()) as SaveFailed).reason, contains('maybe'));

    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel(saveChannelName),
      null,
    );
    expect(((await save()) as SaveFailed).reason, contains('no save channel'));
  });

  test(
    'both edges are logged in debug, with the name and the type — never the temporary',
    () async {
      platform((MethodCall _) => 'saved');

      await save();

      final List<Map<String, Object?>> lines = log.withOp(LogOp.filesSave);
      expect(lines, hasLength(2));
      expect(lines.every((Map<String, Object?> line) => line['level'] == 'debug'), isTrue);
      expect(lines.first['name'], 'report.pdf');
      expect(lines.toString(), isNot(contains('/cache/')));
    },
  );
}
