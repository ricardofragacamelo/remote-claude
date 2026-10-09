/// Entries of the open folder, for the tests of the file browser (plan 25).
library;

import 'package:remote_claude/features/files/domain/entities/file_entry.dart';

/// A file at [path].
FileEntry aFile(String path, {int size = 1200, bool hidden = false}) => FileEntry(
  name: path.split('/').last,
  path: path,
  kind: EntryKind.file,
  size: size,
  hidden: hidden,
);

/// A folder at [path].
FileEntry aFolder(String path, {bool hidden = false}) =>
    FileEntry(name: path.split('/').last, path: path, kind: EntryKind.directory, hidden: hidden);

/// A link at [path], inside the folder unless [outside], leading to [target].
FileEntry aLink(String path, {bool outside = false, TargetKind? target}) => FileEntry(
  name: path.split('/').last,
  path: path,
  kind: EntryKind.symlink,
  outside: outside,
  targetKind: outside ? null : target,
);

/// The error envelope of a refusal, as the server sends it.
String refusal(String code, String messageKey) =>
    '{"error":{"code":"$code","messageKey":"$messageKey","traceId":"t"}}';
