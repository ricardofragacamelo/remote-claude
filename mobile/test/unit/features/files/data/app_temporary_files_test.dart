@TestOn('vm')
library;

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/features/files/data/engines/app_temporary_files.dart';

import '../../../../support/fakes/recording_writer.dart';

void main() {
  late Directory base;
  late RecordingWriter log;
  late AppTemporaryFiles temporary;

  setUp(() {
    base = Directory.systemTemp.createTempSync('rc-temporary-');
    log = RecordingWriter();
    final AppLogger logger = AppLogger(
      context: const LogContext(appVersion: '0.0.1', platform: 'android'),
      writer: log.writer,
    );
    addTearDown(logger.dispose);
    temporary = AppTemporaryFiles(logger: logger, base: () async => base);
  });

  tearDown(() {
    Process.runSync('chmod', <String>['-R', 'u+w', base.path]);
    base.deleteSync(recursive: true);
  });

  test('S-130 · the same name twice is two places, each keeping the name', () async {
    final String first = await temporary.create('report.pdf');
    final String second = await temporary.create('report.pdf');

    expect(first, isNot(second));
    expect(first, endsWith('${Platform.pathSeparator}report.pdf'));
    expect(File(first).parent.path, startsWith(base.path));
  });

  test('deleting takes the file and the folder made for it', () async {
    final String path = await temporary.create('a.txt');
    File(path).writeAsStringSync('x');

    await temporary.discard(path);

    expect(File(path).parent.existsSync(), isFalse);
  });

  test('a file in a folder it did not make is deleted alone; a missing one is nothing', () async {
    final File other = File('${base.path}${Platform.pathSeparator}kept.txt')
      ..writeAsStringSync('x');

    await temporary.discard(other.path);
    await temporary.discard(other.path);

    expect(other.existsSync(), isFalse);
    expect(base.existsSync(), isTrue);
  });

  test('a temporary that cannot be deleted is logged, and nothing is thrown', () async {
    final String path = await temporary.create('a.txt');
    File(path).writeAsStringSync('x');
    Process.runSync('chmod', <String>['a-w', File(path).parent.path]);

    await temporary.discard(path);

    expect(log.withOp('files.download.temporary').single['level'], 'warn');
  });
}
