/// Reading a level of the folder, and the ceilings of its routes.
library;

import 'package:remote_claude/features/files/domain/entities/file_entry.dart';
import 'package:remote_claude/features/files/domain/entities/file_limits.dart';
import 'package:remote_claude/features/files/domain/entities/text_document.dart';
import 'package:remote_claude/features/files/domain/ports/byte_reader.dart';
import 'package:remote_claude/features/files/domain/repositories/files_repository.dart';

/// One level of a folder.
class ListLevel {
  const ListLevel(this._files);

  final FilesRepository _files;

  /// [path] of [folder].
  Future<FileListing> call(String folder, String path) => _files.tree(folder, path);
}

/// The ceilings of the file routes.
class ReadFileLimits {
  const ReadFileLimits(this._files);

  final FilesRepository _files;

  Future<FileLimits> call() => _files.limits();
}

/// The text of a file, again only when it changed.
class ReadTextFile {
  const ReadTextFile(this._files);

  final FilesRepository _files;

  Future<TextRead> call(String folder, String path, {String? ifNoneMatch}) =>
      _files.content(folder, path, ifNoneMatch: ifNoneMatch);
}

/// The bytes of a file.
class ReadRawFile {
  const ReadRawFile(this._files);

  final FilesRepository _files;

  Future<RawFile> call(String folder, String path) => _files.raw(folder, path);
}

/// A file read by ranges.
class OpenFileReader {
  const OpenFileReader(this._files);

  final FilesRepository _files;

  ByteReader call(String folder, String path) => _files.reader(folder, path);
}
