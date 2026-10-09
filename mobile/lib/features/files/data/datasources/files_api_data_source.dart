/// The file routes of the backend, as the app calls them — `GET` only (plan 25, B-07, B-09).
///
/// The folder and the path travel in the query string, never as segments of the address: a proxy
/// that normalises `%2F` would change them. The client logs both edges of every call — the path
/// alone, never a folder or a file's contents —, so nothing here does
/// (docs/architecture/mobile/05-logging.md).
library;

import 'package:remote_claude/core/network/api_client.dart';

/// What the files repository needs from the backend.
abstract interface class FilesApiDataSource {
  /// `GET /files/tree?folder=&path=`.
  Future<Object?> tree(String folder, String path);

  /// `GET /files/limits`.
  Future<Object?> limits();

  /// `GET /files/content?folder=&path=`, with `If-None-Match` when a version is named.
  Future<VersionedAnswer> content(String folder, String path, {String? ifNoneMatch});

  /// `GET /files/raw?folder=&path=` — the bytes, with the credential in the header.
  Future<ByteAnswer> raw(String folder, String path);

  /// `GET /files/raw?folder=&path=` with `Range: bytes=start-end`.
  Future<RangeAnswer> rawRange(String folder, String path, int start, int end);

  /// `GET /files/raw?folder=&path=&download=true`, written in stream as [how] says — the download
  /// the trail records. From [RawDownload.from] on, the rest of the same download: no
  /// `download=true`, so the trail keeps one entry; `Range` and `If-Match` instead.
  Future<DownloadAnswer> download(String folder, String path, RawDownload how);
}

/// [FilesApiDataSource] over the one HTTP client.
class HttpFilesApiDataSource implements FilesApiDataSource {
  const HttpFilesApiDataSource(this._api);

  final ApiClient _api;

  @override
  Future<Object?> tree(String folder, String path) =>
      _api.get('/files/tree', query: <String, Object?>{'folder': folder, 'path': path});

  @override
  Future<Object?> limits() => _api.get('/files/limits');

  @override
  Future<VersionedAnswer> content(String folder, String path, {String? ifNoneMatch}) =>
      _api.getVersioned(
        '/files/content',
        query: <String, Object?>{'folder': folder, 'path': path},
        ifNoneMatch: ifNoneMatch,
      );

  @override
  Future<ByteAnswer> raw(String folder, String path) =>
      _api.bytes('/files/raw', query: <String, Object?>{'folder': folder, 'path': path});

  @override
  Future<RangeAnswer> rawRange(String folder, String path, int start, int end) => _api.bytesRange(
    '/files/raw',
    start: start,
    end: end,
    query: <String, Object?>{'folder': folder, 'path': path},
  );

  @override
  Future<DownloadAnswer> download(String folder, String path, RawDownload how) => _api.download(
    '/files/raw',
    into: how.into,
    onProgress: how.onProgress,
    onHeaders: how.onHeaders,
    query: <String, Object?>{'folder': folder, 'path': path, if (how.from == 0) 'download': true},
    from: how.from,
    ifMatch: how.ifMatch,
    cancel: how.cancel,
  );
}

/// How one download is asked: where it is written, who hears it, and from where it starts.
class RawDownload {
  const RawDownload({
    required this.into,
    required this.onProgress,
    this.onHeaders,
    this.from = 0,
    this.ifMatch,
    this.cancel,
  });

  /// The file the body is written into.
  final String into;

  /// The bytes written so far, and the size of the body — `-1` when the server did not say.
  final void Function(int received, int total) onProgress;

  /// The version and the type, before the first byte.
  final void Function(DownloadHeaders headers)? onHeaders;

  /// Where the body starts — not `0` for the rest of a download the connection cut.
  final int from;

  /// The version the rest must be of.
  final String? ifMatch;

  final TransferCancel? cancel;
}
