@TestOn('vm')
library;

import 'dart:async';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/network/api_client.dart';
import 'package:remote_claude/features/files/data/datasources/files_api_data_source.dart';
import 'package:remote_claude/features/files/data/engines/app_temporary_files.dart';
import 'package:remote_claude/features/files/data/repositories/files_repository_impl.dart';
import 'package:remote_claude/features/files/domain/entities/download.dart';
import 'package:remote_claude/features/files/domain/usecases/download_file.dart';

import '../../../../support/fakes/fake_credentials.dart';
import '../../../../support/fakes/fake_file_saver.dart';
import '../../../../support/fakes/local_file_server.dart';
import '../../../../support/fakes/recording_writer.dart';

/// The download over a real socket: the real Dio and its interceptors, a temporary directory on
/// disk, and the "save as" played by the test (plan 25, B-27).
void main() {
  late LocalFileServer server;
  late Directory base;
  final List<Completer<void>> holds = <Completer<void>>[];
  final Uint8List content = Uint8List.fromList(
    List<int>.generate(300 * 1024, (int index) => Random(index).nextInt(256)),
  );

  /// Answers [file] as `/files/raw` does: the whole, or the rest from `Range` when `If-Match` names
  /// [etag]. [cutAfter] bytes in, the connection drops; [hold] keeps the body waiting after its
  /// first piece.
  Future<void> Function(HttpRequest request) serving(
    Uint8List file, {
    String Function() etag = _v1,
    int? Function()? cutAfter,
    Future<void>? hold,
  }) =>
      (HttpRequest request) => _answering(request, () async {
        final HttpResponse response = request.response;
        final String? range = request.headers.value('range');
        final String? ifMatch = request.headers.value('if-match');
        if (ifMatch != null && ifMatch != etag()) {
          response
            ..statusCode = 412
            ..headers.contentType = ContentType.json
            ..write(
              '{"error":{"code":"FILE_CHANGED","messageKey":"files.error.changed","traceId":"t",'
              '"params":{"path":"big.bin"}}}',
            );
          await response.close();
          return;
        }

        final int start = range == null ? 0 : int.parse(range.substring(6, range.length - 1));
        final Uint8List body = Uint8List.sublistView(file, start);
        response
          ..statusCode = range == null ? 200 : 206
          ..contentLength = body.length
          // Every piece leaves when it is written — buffered, a cut would take the bytes before it.
          ..bufferOutput = false;
        response.headers
          ..set('etag', etag())
          ..set('content-type', 'application/octet-stream');
        if (range != null) {
          response.headers.set('content-range', 'bytes $start-${file.length - 1}/${file.length}');
        }

        final int? cut = cutAfter?.call();
        if (cut != null) {
          response.add(Uint8List.sublistView(body, 0, cut));
          await response.flush();
          // Fewer bytes than announced: the server drops the connection, as a network that fell.
          await response.close().catchError((Object _) {});
          return;
        }
        for (int at = 0; at < body.length; at += 64 * 1024) {
          response.add(Uint8List.sublistView(body, at, min(at + 64 * 1024, body.length)));
          await response.flush();
          // A breath between pieces, so the client reads them one by one, as from a real network.
          await Future<void>.delayed(const Duration(milliseconds: 5));
          if (hold != null) {
            await hold;
          }
        }
        await response.close();
      });

  setUp(() async {
    server = await LocalFileServer.start();
    base = Directory.systemTemp.createTempSync('rc-download-');
    server.routes['/files/limits'] = (_) => LocalFileServer.json(<String, Object?>{
      'maxEditBytes': 10,
      'largeFileBytes': 5,
      'downloadMaxBytes': 1024 * 1024,
    });
  });

  tearDown(() async {
    for (final Completer<void> hold in holds) {
      if (!hold.isCompleted) {
        hold.complete();
      }
    }
    holds.clear();
    await server.close();
    base.deleteSync(recursive: true);
  });

  ({DownloadFile download, RecordingFileSaver saver, AppLogger logger}) app({
    FakeCredentials? credentials,
  }) {
    final ({ApiClient client, RecordingWriter log, AppLogger logger}) http = server.client(
      credentials: credentials,
    );
    addTearDown(http.logger.dispose);
    final RecordingFileSaver saver = RecordingFileSaver();
    return (
      download: DownloadFile(
        FilesRepositoryImpl(HttpFilesApiDataSource(http.client)),
        AppTemporaryFiles(logger: http.logger, base: () async => base),
        saver,
      ),
      saver: saver,
      logger: http.logger,
    );
  }

  Future<DownloadOutcome> fetch(
    DownloadFile download, {
    String path = 'big.bin',
    List<int>? progress,
    DownloadCancel? cancel,
  }) => download(
    DownloadRequest(folder: '/w', path: path),
    cancel: cancel ?? DownloadCancel(),
    onProgress: (int received, int? total) => progress?.add(received),
  );

  List<SeenRequest> raws() =>
      server.seen.where((SeenRequest seen) => seen.uri.path == '/files/raw').toList();

  test('S-122 · in stream to a temporary, with progress and the Bearer in the header', () async {
    server.streams['/files/raw'] = serving(content);
    final List<int> progress = <int>[];
    final ({DownloadFile download, RecordingFileSaver saver, AppLogger logger}) it = app();

    expect(await fetch(it.download, progress: progress), isA<Downloaded>());

    expect(it.saver.offered.single.bytes, content);
    expect(it.saver.offered.single.name, 'big.bin');
    expect(it.saver.offered.single.mimeType, 'application/octet-stream');
    expect(progress.length, greaterThan(1));
    expect(progress.last, content.length);
    final SeenRequest request = raws().single;
    expect(request.uri.queryParameters['download'], 'true');
    expect(request.headers.value('authorization'), 'Bearer token');
    expect(request.uri.toString(), isNot(contains('token')));
    expect(base.listSync(), isEmpty, reason: 'the temporary is deleted once saved');
  });

  test('S-123 · cancelled on the way: the temporary goes, and no "save as" opens', () async {
    final Completer<void> hold = Completer<void>();
    holds.add(hold);
    server.streams['/files/raw'] = serving(content, hold: hold.future);
    final DownloadCancel cancel = DownloadCancel();
    final ({DownloadFile download, RecordingFileSaver saver, AppLogger logger}) it = app();

    final DownloadOutcome outcome = await it.download(
      const DownloadRequest(folder: '/w', path: 'big.bin'),
      cancel: cancel,
      onProgress: (int received, int? total) => cancel.cancel(),
    );

    expect(outcome, isA<DownloadCancelled>());
    expect(it.saver.offered, isEmpty);
    expect(base.listSync(), isEmpty);
  });

  test(
    'S-125 · the network falls, and falls again on the one resume: an error, nothing kept',
    () async {
      server.streams['/files/raw'] = serving(content, cutAfter: () => 1000);
      final ({DownloadFile download, RecordingFileSaver saver, AppLogger logger}) it = app();

      final DownloadOutcome outcome = await fetch(it.download);

      expect((outcome as DownloadRefused).failure, isA<NetworkFailure>());
      expect(raws(), hasLength(2), reason: 'one resume, not a loop');
      expect(it.saver.offered, isEmpty);
      expect(base.listSync(), isEmpty);
    },
  );

  test('the network falls before the first byte: an error, with no resume', () async {
    server.streams['/files/raw'] = serving(content, cutAfter: () => 0);
    final ({DownloadFile download, RecordingFileSaver saver, AppLogger logger}) it = app();

    expect(((await fetch(it.download)) as DownloadRefused).failure, isA<NetworkFailure>());
    expect(raws(), hasLength(1));
  });

  test(
    'S-126 · the token expires on the way: renewed once, the rest by Range of the same version',
    () async {
      final FakeCredentials credentials = FakeCredentials(renewal: 'renewed');
      int answered = 0;
      server.streams['/files/raw'] = serving(
        content,
        cutAfter: () {
          answered += 1;
          if (answered == 1) {
            server.acceptedToken = 'renewed';
            return 100 * 1024;
          }
          return null;
        },
      );
      final List<int> progress = <int>[];
      final ({DownloadFile download, RecordingFileSaver saver, AppLogger logger}) it = app(
        credentials: credentials,
      );

      expect(await fetch(it.download, progress: progress), isA<Downloaded>());

      expect(it.saver.offered.single.bytes, content, reason: 'stitched whole, byte for byte');
      expect(credentials.renewals, 1);
      final List<SeenRequest> seen = raws();
      expect(seen, hasLength(3));
      expect(seen.first.uri.queryParameters['download'], 'true');
      for (final SeenRequest resume in seen.skip(1)) {
        expect(resume.headers.value('range'), 'bytes=${100 * 1024}-');
        expect(resume.headers.value('if-match'), '"v1"');
        expect(
          resume.uri.queryParameters.containsKey('download'),
          isFalse,
          reason: 'one trail entry',
        );
      }
      expect(progress.last, content.length);
    },
  );

  test('the file changed between the cut and the resume: refused, never stitched', () async {
    String version = '"v1"';
    server.streams['/files/raw'] = serving(
      content,
      etag: () => version,
      cutAfter: () {
        if (version == '"v1"') {
          version = '"v2"';
          return 1000;
        }
        return null;
      },
    );
    final ({DownloadFile download, RecordingFileSaver saver, AppLogger logger}) it = app();

    final DownloadOutcome outcome = await fetch(it.download);

    expect((outcome as DownloadRefused).failure.code, 'FILE_CHANGED');
    expect(it.saver.offered, isEmpty);
    expect(base.listSync(), isEmpty);
  });

  test('S-128 · a file of zero bytes downloads', () async {
    server.streams['/files/raw'] = serving(Uint8List(0));
    final ({DownloadFile download, RecordingFileSaver saver, AppLogger logger}) it = app();

    expect(await fetch(it.download, path: 'empty.txt'), isA<Downloaded>());
    expect(it.saver.offered.single.bytes, isEmpty);
  });

  test('S-129 · two files at once, each with its own progress and temporary', () async {
    final Uint8List small = Uint8List.fromList(List<int>.filled(70 * 1024, 7));
    server.streams['/files/raw'] = (HttpRequest request) =>
        serving(request.uri.queryParameters['path'] == 'small.bin' ? small : content)(request);
    final ({DownloadFile download, RecordingFileSaver saver, AppLogger logger}) it = app();
    final List<int> big = <int>[];
    final List<int> little = <int>[];

    await Future.wait(<Future<DownloadOutcome>>[
      fetch(it.download, progress: big),
      fetch(it.download, path: 'small.bin', progress: little),
    ]);

    expect(big.last, content.length);
    expect(little.last, small.length);
    final Map<String, OfferedFile> byName = <String, OfferedFile>{
      for (final OfferedFile file in it.saver.offered) file.name: file,
    };
    expect(byName['big.bin']!.bytes, content);
    expect(byName['small.bin']!.bytes, small);
    expect(byName['big.bin']!.path, isNot(byName['small.bin']!.path));
  });

  test(
    'S-130 · the same file twice: two "save as", neither temporary stepping on the other',
    () async {
      server.streams['/files/raw'] = serving(content);
      final ({DownloadFile download, RecordingFileSaver saver, AppLogger logger}) it = app();

      await Future.wait(<Future<DownloadOutcome>>[fetch(it.download), fetch(it.download)]);

      expect(it.saver.offered, hasLength(2));
      expect(it.saver.offered.first.path, isNot(it.saver.offered.last.path));
      expect(it.saver.offered.every((OfferedFile file) => _same(file.bytes, content)), isTrue);
      expect(base.listSync(), isEmpty);
    },
  );
}

String _v1() => '"v1"';

/// Runs [answer] for [request]; a client that left on the way — the cancel, the cut — makes the
/// server's next write fail, and that is the client's story, not the server's.
Future<void> _answering(HttpRequest request, Future<void> Function() answer) async {
  try {
    await answer();
  } on IOException {
    await request.response.close().catchError((Object _) {});
  }
}

bool _same(List<int>? a, List<int> b) =>
    a != null &&
    a.length == b.length &&
    Iterable<int>.generate(a.length).every((int i) => a[i] == b[i]);
