import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/features/files/domain/entities/download.dart';
import 'package:remote_claude/features/files/files_providers.dart';
import 'package:remote_claude/features/files/presentation/providers/downloads_controller.dart';

import '../../../../support/fakes/fake_file_saver.dart';
import '../../../../support/fakes/fake_files_repository.dart';
import '../../../../support/fakes/recording_writer.dart';

void main() {
  late FakeFilesRepository files;
  late RecordingWriter log;
  late ProviderContainer container;

  setUp(() {
    files = FakeFilesRepository()..downloadGate = Completer<void>();
    log = RecordingWriter();
    final AppLogger logger = AppLogger(
      context: const LogContext(appVersion: '0.0.1', platform: 'android'),
      writer: log.writer,
    );
    addTearDown(logger.dispose);
    container = ProviderContainer(
      overrides: <Override>[
        filesRepositoryProvider.overrideWithValue(files),
        temporaryFilesProvider.overrideWithValue(MemoryTemporaryFiles()),
        fileSaverProvider.overrideWithValue(RecordingFileSaver()),
        appLoggerProvider.overrideWithValue(logger),
      ],
    );
    addTearDown(container.dispose);
  });

  Map<int, DownloadTask> tasks() => container.read(downloadsProvider);
  Downloads downloads() => container.read(downloadsProvider.notifier);
  const DownloadRequest report = DownloadRequest(folder: '/w', path: 'docs/report.pdf');

  test(
    'S-129 · two downloads at once: two tasks, each with its own progress, gone at the end',
    () async {
      final Future<DownloadOutcome> first = downloads().start(report);
      final Future<DownloadOutcome> second = downloads().start(
        const DownloadRequest(folder: '/w', path: 'b.txt'),
      );
      await Future<void>.delayed(Duration.zero);

      expect(tasks().values.map((DownloadTask task) => task.name), <String>['report.pdf', 'b.txt']);
      expect(tasks().values.map((DownloadTask task) => task.fraction), <double>[0.5, 0.5]);

      files.downloadGate!.complete();
      expect(await first, isA<Downloaded>());
      expect(await second, isA<Downloaded>());
      expect(tasks(), isEmpty);
      expect(log.withOp('files.download'), hasLength(4));
    },
  );

  test('S-123 · cancel stops that download alone', () async {
    final Future<DownloadOutcome> first = downloads().start(report);
    final Future<DownloadOutcome> second = downloads().start(report);
    await Future<void>.delayed(Duration.zero);

    downloads().cancel(tasks().keys.first);
    expect(await first, isA<DownloadCancelled>());
    expect(tasks().keys, hasLength(1));

    files.downloadGate!.complete();
    expect(await second, isA<Downloaded>());
    downloads().cancel(99);
  });

  test('the bar moves once per hundredth, not once per piece', () async {
    files.downloadSteps = <(int, int?)>[(1, 1000), (2, 1000), (9, 1000), (10, 1000), (11, null)];
    final List<int> seen = <int>[];
    container.listen(downloadsProvider, (_, Map<int, DownloadTask> next) {
      if (next.isNotEmpty) {
        seen.add(next.values.single.received);
      }
    });

    final Future<DownloadOutcome> going = downloads().start(report);
    await Future<void>.delayed(Duration.zero);

    expect(seen, <int>[0, 1, 10, 11]);
    files.downloadGate!.complete();
    await going;
  });

  test(
    'a download that ends after the app let go of it says how it ended, and nothing more',
    () async {
      final Future<DownloadOutcome> going = downloads().start(report);
      await Future<void>.delayed(Duration.zero);

      container.dispose();
      files.downloadGate!.complete();

      expect(await going, isA<Downloaded>());
    },
  );

  test('a task knows how far it went only once the size is known', () {
    const DownloadTask unknown = DownloadTask(id: 0, name: 'a');
    const DownloadTask empty = DownloadTask(id: 0, name: 'a', total: 0);

    expect(unknown.fraction, isNull);
    expect(empty.fraction, isNull);
    expect(const DownloadTask(id: 0, name: 'a', received: 1, total: 4).fraction, 0.25);
    expect(
      const DownloadTask(id: 0, name: 'a', received: 1, total: 4),
      isNot(const DownloadTask(id: 0, name: 'a', received: 2, total: 4)),
    );
  });
}
