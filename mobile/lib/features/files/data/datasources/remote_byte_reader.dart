/// A file of the folder read by ranges, through the app's one HTTP client (plan 25, D-22).
///
/// Not the PDF engine's own URI loader: that one writes the whole file to the app's cache on disk
/// and goes around the interceptors — no renewal on `401`, no `x-install-id`, no I/O log. Here every
/// piece is a `GET /files/raw` with `Range`, through the client, and the pieces live in memory, the
/// last few of them only.
library;

import 'dart:typed_data';

import 'package:remote_claude/core/network/api_client.dart';
import 'package:remote_claude/features/files/data/datasources/files_api_data_source.dart';
import 'package:remote_claude/features/files/domain/ports/byte_reader.dart';

/// How much one request reads: 1 MB, what the spike measured best (S-01).
const int readBlock = 1024 * 1024;

/// How many blocks are kept in memory.
const int keptBlocks = 8;

/// [ByteReader] over `/files/raw` with `Range`.
class RemoteByteReader implements ByteReader {
  RemoteByteReader(this._api, {required this.folder, required this.path});

  final FilesApiDataSource _api;
  final String folder;
  final String path;

  /// The blocks read, the oldest first.
  final Map<int, Uint8List> _blocks = <int, Uint8List>{};
  int? _size;

  /// How many requests reached the server — what a test counts.
  int requests = 0;

  @override
  Future<ByteProbe> probe() async {
    final RangeAnswer first = await _fetch(0);
    return ByteProbe(size: first.total, contentType: first.contentType);
  }

  @override
  Future<Uint8List> read(int start, int length) async {
    final int size = _size ?? (await probe()).size;
    final int end = start + length < size ? start + length : size;
    final BytesBuilder out = BytesBuilder(copy: false);

    for (int at = start; at < end;) {
      final int index = at ~/ readBlock;
      final Uint8List block = _blocks[index] ?? (await _fetch(index)).bytes;
      final int from = at - index * readBlock;
      final int take = block.length - from < end - at ? block.length - from : end - at;
      out.add(Uint8List.sublistView(block, from, from + take));
      at += take;
    }
    return out.takeBytes();
  }

  Future<RangeAnswer> _fetch(int index) async {
    requests += 1;
    final int start = index * readBlock;
    final RangeAnswer answer = await _api.rawRange(folder, path, start, start + readBlock - 1);

    _size = answer.total;
    _blocks.remove(index);
    _blocks[index] = answer.bytes;
    while (_blocks.length > keptBlocks) {
      _blocks.remove(_blocks.keys.first);
    }
    return answer;
  }
}
