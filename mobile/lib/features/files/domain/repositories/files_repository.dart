/// The files of the open folder, as the app reads them — and only reads (plan 25, B-07).
library;

import 'package:remote_claude/features/files/domain/entities/download.dart';
import 'package:remote_claude/features/files/domain/entities/file_entry.dart';
import 'package:remote_claude/features/files/domain/entities/file_limits.dart';
import 'package:remote_claude/features/files/domain/entities/text_document.dart';
import 'package:remote_claude/features/files/domain/ports/byte_reader.dart';

/// Reading the open folder.
abstract interface class FilesRepository {
  /// One level of [folder]: [path] relative to it, `''` for the folder itself.
  ///
  /// @throws [Failure] — `FILE_NOT_FOUND`, `WORKSPACE_NOT_ALLOWED`, `DEVICE_NOT_REGISTERED`…
  Future<FileListing> tree(String folder, String path);

  /// The ceilings of the server's file routes.
  Future<FileLimits> limits();

  /// The text of [path] — or that it did not change, when [ifNoneMatch] names the version on disk.
  ///
  /// @throws [Failure] — `FILE_NOT_TEXT`, `FILE_TOO_LARGE`, `FILE_NOT_FOUND`…
  Future<TextRead> content(String folder, String path, {String? ifNoneMatch});

  /// The bytes of [path], and the type the server read in them.
  Future<RawFile> raw(String folder, String path);

  /// [path], read by ranges — what the PDF engine reads (D-22).
  ByteReader reader(String folder, String path);

  /// Downloads [path] in stream into the file at [into] — resuming once from where it stopped when
  /// the connection drops on the way (R-09). Not complete when [cancel] stopped it.
  ///
  /// @throws [Failure] — the network, `FILE_TOO_LARGE`, `FILE_NOT_FOUND`, a file that changed while
  ///   it came…
  Future<FetchedFile> download(
    String folder,
    String path, {
    required String into,
    required DownloadProgress onProgress,
    required DownloadCancel cancel,
  });
}
