/// The files repository: the wire, turned into the entities the panel and the viewer work with.
library;

import 'package:remote_claude/features/files/data/datasources/files_api_data_source.dart';
import 'package:remote_claude/features/files/data/datasources/remote_byte_reader.dart';
import 'package:remote_claude/features/files/data/mappers/tree_mapper.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/network/api_client.dart';
import 'package:remote_claude/features/files/domain/entities/download.dart';
import 'package:remote_claude/features/files/domain/entities/file_entry.dart';
import 'package:remote_claude/features/files/domain/entities/file_limits.dart';
import 'package:remote_claude/features/files/domain/entities/text_document.dart';
import 'package:remote_claude/features/files/domain/ports/byte_reader.dart';
import 'package:remote_claude/features/files/domain/repositories/files_repository.dart';

/// [FilesRepository] over the backend's HTTP API.
///
/// The ceilings are read once and kept (S-23): they are the installation's, and asking for them
/// before every file would double the requests. A failed read is not kept — the next one asks again.
class FilesRepositoryImpl implements FilesRepository {
  FilesRepositoryImpl(this._api);

  final FilesApiDataSource _api;
  Future<FileLimits>? _limits;

  @override
  Future<FileListing> tree(String folder, String path) async =>
      listingFrom(await _api.tree(folder, path));

  @override
  Future<FileLimits> limits() {
    final Future<FileLimits> read = _limits ??= _api.limits().then(limitsFrom);
    return read.catchError((Object error) {
      _limits = null;
      throw error;
    });
  }

  @override
  Future<TextRead> content(String folder, String path, {String? ifNoneMatch}) async {
    final VersionedAnswer answer = await _api.content(folder, path, ifNoneMatch: ifNoneMatch);

    return answer.notModified
        ? const TextUnchanged()
        : TextChanged(documentFrom(answer.data, etag: answer.etag));
  }

  @override
  Future<RawFile> raw(String folder, String path) async {
    final ByteAnswer answer = await _api.raw(folder, path);
    return RawFile(bytes: answer.bytes, contentType: answer.contentType);
  }

  @override
  ByteReader reader(String folder, String path) =>
      RemoteByteReader(_api, folder: folder, path: path);

  /// The rest of a download the connection cut is asked once: from what arrived on, of the same
  /// version — a file that changed meanwhile is refused (`412`), never stitched to the bytes before
  /// (R-09). A token that expired on the way is renewed by the client, as on any request.
  @override
  Future<FetchedFile> download(
    String folder,
    String path, {
    required String into,
    required DownloadProgress onProgress,
    required DownloadCancel cancel,
  }) async {
    final TransferCancel transfer = TransferCancel();
    cancel.onCancel(transfer.cancel);
    DownloadHeaders? headers;
    int received = 0;

    try {
      final DownloadAnswer answer = await _api.download(
        folder,
        path,
        RawDownload(
          into: into,
          cancel: transfer,
          onHeaders: (DownloadHeaders first) => headers = first,
          onProgress: (int bytes, int total) {
            received = bytes;
            onProgress(bytes, total < 0 ? null : total);
          },
        ),
      );
      return (complete: !answer.cancelled, contentType: headers?.contentType);
    } on NetworkFailure {
      final String? version = headers?.etag;
      final int offset = received;
      if (offset == 0 || version == null || cancel.cancelled) {
        rethrow;
      }
      final DownloadAnswer rest = await _api.download(
        folder,
        path,
        RawDownload(
          into: into,
          from: offset,
          ifMatch: version,
          cancel: transfer,
          onProgress: (int bytes, int total) =>
              onProgress(offset + bytes, total < 0 ? null : offset + total),
        ),
      );
      return (complete: !rest.cancelled, contentType: headers?.contentType);
    }
  }
}
