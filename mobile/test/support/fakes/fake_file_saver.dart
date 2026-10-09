/// The system's "save as" and the temporary files, as a test drives them (plan 25, B-26, B-27).
library;

import 'dart:io';

import 'package:remote_claude/features/files/domain/ports/file_saver.dart';
import 'package:remote_claude/features/files/domain/ports/temporary_files.dart';

/// One file offered to the "save as": where it was, its name and type, and what it held then.
typedef OfferedFile = ({String path, String name, String mimeType, List<int>? bytes});

/// Answers [outcome], and records what it was offered — with the bytes, when the file is on disk.
class RecordingFileSaver implements FileSaver {
  RecordingFileSaver({this.outcome = const Saved()});

  /// What the person does with the dialog.
  SaveOutcome outcome;

  final List<OfferedFile> offered = <OfferedFile>[];

  @override
  Future<SaveOutcome> save({
    required String temporaryPath,
    required String name,
    required String mimeType,
  }) async {
    final File file = File(temporaryPath);
    offered.add((
      path: temporaryPath,
      name: name,
      mimeType: mimeType,
      bytes: file.existsSync() ? file.readAsBytesSync() : null,
    ));
    return outcome;
  }
}

/// Temporary paths that are only names: what was made, and what was deleted.
class MemoryTemporaryFiles implements TemporaryFiles {
  final List<String> created = <String>[];
  final List<String> deleted = <String>[];

  @override
  Future<String> create(String name) async {
    final String path = '/tmp/download-${created.length}/$name';
    created.add(path);
    return path;
  }

  @override
  Future<void> discard(String path) async => deleted.add(path);
}
