/// [TemporaryFiles] in the app's temporary directory (plan 25, B-27).
///
/// Each download gets a folder of its own under it — `download-` and a unique suffix —, and the
/// file keeps its name there, so the system's "save as" shows the name it will suggest. Deleting
/// removes the folder whole.
library;

import 'dart:io';

import 'package:path_provider/path_provider.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/features/files/domain/ports/temporary_files.dart';

/// The prefix of a download's folder — the only folders [AppTemporaryFiles.discard] removes.
const String downloadFolderPrefix = 'download-';

/// [TemporaryFiles] over `path_provider`.
class AppTemporaryFiles implements TemporaryFiles {
  /// [base] is the platform's temporary directory unless a test brings one.
  AppTemporaryFiles({required this._logger, Future<Directory> Function()? base})
    : _base = base ?? getTemporaryDirectory;

  final AppLogger _logger;
  final Future<Directory> Function() _base;

  @override
  Future<String> create(String name) async {
    final Directory folder = await (await _base()).createTemp(downloadFolderPrefix);
    return '${folder.path}${Platform.pathSeparator}$name';
  }

  @override
  Future<void> discard(String path) async {
    final File file = File(path);
    final Directory folder = file.parent;
    final bool own = folder.path
        .split(Platform.pathSeparator)
        .last
        .startsWith(downloadFolderPrefix);

    try {
      if (own) {
        await folder.delete(recursive: true);
      } else if (file.existsSync()) {
        await file.delete();
      }
    } on FileSystemException catch (error) {
      _logger.warn(
        'a temporary download could not be deleted',
        op: 'files.download.temporary',
        fields: <String, Object?>{'osError': error.osError?.errorCode},
      );
    }
  }
}
