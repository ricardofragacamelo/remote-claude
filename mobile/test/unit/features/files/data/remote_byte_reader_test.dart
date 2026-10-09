import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/network/api_client.dart';
import 'package:remote_claude/features/files/data/datasources/files_api_data_source.dart';
import 'package:remote_claude/features/files/data/datasources/remote_byte_reader.dart';
import 'package:remote_claude/features/files/domain/ports/byte_reader.dart';

/// A file of [size] bytes, each the low byte of its position, answered by range.
class _Ranges implements FilesApiDataSource {
  _Ranges(this.size);

  final int size;
  final List<(int, int)> asked = <(int, int)>[];

  @override
  Future<RangeAnswer> rawRange(String folder, String path, int start, int end) async {
    asked.add((start, end));
    final int last = end < size ? end : size - 1;
    return (
      bytes: Uint8List.fromList(<int>[for (int at = start; at <= last; at++) at & 0xff]),
      contentType: 'application/pdf',
      total: size,
    );
  }

  @override
  Future<Object?> tree(String folder, String path) => throw UnimplementedError();
  @override
  Future<Object?> limits() => throw UnimplementedError();
  @override
  Future<VersionedAnswer> content(String folder, String path, {String? ifNoneMatch}) =>
      throw UnimplementedError();
  @override
  Future<ByteAnswer> raw(String folder, String path) => throw UnimplementedError();

  @override
  Future<DownloadAnswer> download(String folder, String path, RawDownload how) =>
      throw UnimplementedError();
}

void main() {
  test('the first piece says the size and the type', () async {
    final _Ranges ranges = _Ranges(3 * readBlock + 10);
    final ByteProbe probe = await RemoteByteReader(ranges, folder: '/w', path: 'a.pdf').probe();

    expect(probe.size, 3 * readBlock + 10);
    expect(probe.contentType, 'application/pdf');
    expect(ranges.asked.single, (0, readBlock - 1));
  });

  test('a read across two blocks asks each block once, and the bytes are the file\'s', () async {
    final _Ranges ranges = _Ranges(3 * readBlock);
    final RemoteByteReader reader = RemoteByteReader(ranges, folder: '/w', path: 'a.pdf');

    final Uint8List bytes = await reader.read(readBlock - 2, 4);
    await reader.read(readBlock - 2, 4);

    expect(bytes, <int>[(readBlock - 2) & 0xff, (readBlock - 1) & 0xff, 0, 1]);
    expect(ranges.asked, <(int, int)>[(0, readBlock - 1), (readBlock, 2 * readBlock - 1)]);
    expect(reader.requests, 2);
  });

  test('the end of the file answers fewer bytes', () async {
    final RemoteByteReader reader = RemoteByteReader(_Ranges(100), folder: '/w', path: 'a.pdf');

    expect(await reader.read(90, 50), hasLength(10));
  });

  test('R-02 · only the last blocks are kept: an old one is asked again', () async {
    final _Ranges ranges = _Ranges((keptBlocks + 2) * readBlock);
    final RemoteByteReader reader = RemoteByteReader(ranges, folder: '/w', path: 'a.pdf');

    for (int block = 0; block <= keptBlocks; block++) {
      await reader.read(block * readBlock, 1);
    }
    await reader.read(0, 1);

    expect(ranges.asked.where(((int, int) range) => range.$1 == 0), hasLength(2));
  });

  test('the size of a Content-Range, or nothing', () {
    expect(totalOf('bytes 0-1023/4096'), 4096);
    expect(totalOf(null), isNull);
    expect(totalOf('bytes */77'), 77);
  });
}
