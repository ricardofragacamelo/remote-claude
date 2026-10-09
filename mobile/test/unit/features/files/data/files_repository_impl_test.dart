import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/network/api_client.dart';
import 'package:remote_claude/features/files/data/datasources/files_api_data_source.dart';
import 'package:remote_claude/features/files/data/repositories/files_repository_impl.dart';
import 'package:remote_claude/features/files/domain/entities/file_limits.dart';
import 'package:remote_claude/features/files/domain/entities/text_document.dart';
import 'package:remote_claude/features/files/domain/ports/byte_reader.dart';

/// Counts the reads of the ceilings, and fails the first when asked to.
class _CountingSource implements FilesApiDataSource {
  int limitReads = 0;
  bool failFirst = false;

  @override
  Future<Object?> limits() async {
    limitReads += 1;
    if (failFirst && limitReads == 1) {
      throw const NetworkFailure(traceId: 't');
    }
    return <String, Object?>{'maxEditBytes': 10, 'largeFileBytes': 5, 'downloadMaxBytes': 20};
  }

  @override
  Future<Object?> tree(String folder, String path) async => <String, Object?>{};

  @override
  Future<VersionedAnswer> content(String folder, String path, {String? ifNoneMatch}) =>
      throw UnimplementedError();

  @override
  Future<ByteAnswer> raw(String folder, String path) async =>
      (bytes: Uint8List.fromList(<int>[1, 2]), contentType: 'image/png');

  @override
  Future<RangeAnswer> rawRange(String folder, String path, int start, int end) async =>
      (bytes: Uint8List.fromList(<int>[1, 2]), contentType: 'application/pdf', total: 2);

  @override
  Future<DownloadAnswer> download(String folder, String path, RawDownload how) =>
      throw UnimplementedError();
}

void main() {
  test('S-23 · the ceilings are read once and kept', () async {
    final _CountingSource source = _CountingSource();
    final FilesRepositoryImpl repository = FilesRepositoryImpl(source);

    final List<FileLimits> read = await Future.wait(<Future<FileLimits>>[
      repository.limits(),
      repository.limits(),
    ]);
    await repository.limits();

    expect(source.limitReads, 1);
    expect(read.first.maxTextBytes, 10);
  });

  test('a failed read of the ceilings is not kept: the next asks again', () async {
    final _CountingSource source = _CountingSource()..failFirst = true;
    final FilesRepositoryImpl repository = FilesRepositoryImpl(source);

    await expectLater(repository.limits(), throwsA(isA<NetworkFailure>()));
    expect((await repository.limits()).downloadMaxBytes, 20);
    expect(source.limitReads, 2);
  });

  test('the bytes of a file come with the type the server gave them', () async {
    final RawFile file = await FilesRepositoryImpl(_CountingSource()).raw('/w', 'a.png');

    expect(file.bytes, <int>[1, 2]);
    expect(file.contentType, 'image/png');
  });

  test('a reader of a file reads it by ranges, from its size and type', () async {
    final ByteReader reader = FilesRepositoryImpl(_CountingSource()).reader('/w', 'a.pdf');

    final ByteProbe probe = await reader.probe();
    expect(probe.size, 2);
    expect(probe.contentType, 'application/pdf');
  });
}
