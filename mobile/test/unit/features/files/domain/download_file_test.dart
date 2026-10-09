import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/files/domain/entities/download.dart';
import 'package:remote_claude/features/files/domain/ports/file_saver.dart';
import 'package:remote_claude/features/files/domain/usecases/download_file.dart';

import '../../../../support/fakes/fake_file_saver.dart';
import '../../../../support/fakes/fake_files_repository.dart';

void main() {
  late FakeFilesRepository files;
  late MemoryTemporaryFiles temporary;
  late RecordingFileSaver saver;
  late DownloadFile download;

  setUp(() {
    files = FakeFilesRepository();
    temporary = MemoryTemporaryFiles();
    saver = RecordingFileSaver();
    download = DownloadFile(files, temporary, saver);
  });

  Future<DownloadOutcome> run({int? size, DownloadCancel? cancel, List<int?>? progress}) =>
      download(
        DownloadRequest(folder: '/w', path: 'docs/report.txt', size: size),
        cancel: cancel ?? DownloadCancel(),
        onProgress: (int received, int? total) => progress?.add(received),
      );

  test('downloads to a temporary, offers it by its name and type, and deletes it', () async {
    final List<int?> progress = <int?>[];
    files.downloadType = 'text/plain; charset=utf-8';

    expect(await run(progress: progress), isA<Downloaded>());

    expect(files.downloads.single.path, 'docs/report.txt');
    expect(files.downloads.single.into, temporary.created.single);
    expect(saver.offered.single.name, 'report.txt');
    expect(saver.offered.single.mimeType, 'text/plain');
    expect(temporary.deleted, temporary.created);
    expect(progress, <int>[1, 2]);
  });

  test('a body the server gave no type to is offered as any type', () async {
    files.downloadType = null;

    await run();

    expect(saver.offered.single.mimeType, anyType);
  });

  test('S-127 · past the ceiling, nothing is asked and no temporary is made', () async {
    final DownloadOutcome outcome = await run(size: testLimits.downloadMaxBytes + 1);

    expect((outcome as DownloadTooLarge).limit, testLimits.downloadMaxBytes);
    expect(files.downloads, isEmpty);
    expect(temporary.created, isEmpty);
  });

  test('S-127 · exactly at the ceiling, it downloads', () async {
    expect(await run(size: testLimits.downloadMaxBytes), isA<Downloaded>());
  });

  test('the ceilings not read is a refusal, before any temporary', () async {
    files.limitsFailure = const NetworkFailure(traceId: 't');

    expect(((await run()) as DownloadRefused).failure, isA<NetworkFailure>());
    expect(temporary.created, isEmpty);
  });

  test(
    'S-124 · the person cancels the "save as": the temporary goes, and it is no error',
    () async {
      saver.outcome = const SaveCancelled();

      expect(await run(), isA<DownloadCancelled>());
      expect(temporary.deleted, temporary.created);
    },
  );

  test('S-123 · cancelled on the way: no "save as", and the temporary goes', () async {
    final DownloadCancel cancel = DownloadCancel()..cancel();

    expect(await run(cancel: cancel), isA<DownloadCancelled>());
    expect(saver.offered, isEmpty);
    expect(temporary.deleted, temporary.created);
  });

  test('S-125 · the server or the network refuses: the failure, and the temporary goes', () async {
    files.downloadFailure = const NetworkFailure(traceId: 't');

    expect(((await run()) as DownloadRefused).failure, isA<NetworkFailure>());
    expect(saver.offered, isEmpty);
    expect(temporary.deleted, temporary.created);
  });

  test(
    'S-121 · the system could not save: said apart, with its reason, and the temporary goes',
    () async {
      saver.outcome = const SaveFailed('SAVE_FAILED: disk full');

      expect(((await run()) as DownloadNotSaved).reason, contains('disk full'));
      expect(temporary.deleted, temporary.created);
    },
  );

  test('a cancel heard before and after it is asked for, once', () {
    final DownloadCancel cancel = DownloadCancel();
    int heard = 0;
    cancel.onCancel(() => heard += 1);

    cancel
      ..cancel()
      ..cancel()
      ..onCancel(() => heard += 10);

    expect(cancel.cancelled, isTrue);
    expect(heard, 11);
  });
}
