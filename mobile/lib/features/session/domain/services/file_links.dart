/// A file of the folder a message names, and the line it points at (plan 26, B-10) — a port of the
/// web's `fileLinkOf` (`web/src/features/session/lib/file-links.ts`). The cases both ends agree on
/// live in `test/fixtures/file-links.json`, read by a test on each end.
library;

import 'package:equatable/equatable.dart';

/// What reads as a path to a file in a text: segments of name characters joined by `/`, ending in a
/// name with an extension, with an optional `:line` (and `:column`). A word with a slash and no
/// extension — "and/or", "a/b" — is prose, not a file.
final RegExp filePathPattern = RegExp(
  r'(?:/|\.{1,2}/)?(?:[\w@.+-]+/)*[\w@+-][\w@.+-]*\.[A-Za-z0-9]{1,10}(?::\d+(?::\d+)?)?',
);

/// The pattern of one whole path, for a text that is nothing else — inline code.
final RegExp _whole = RegExp('^${filePathPattern.pattern}\$');

/// A file of the folder, and the line it points at.
class FileLink extends Equatable {
  const FileLink({required this.path, this.line});

  /// Relative to the folder of the session.
  final String path;

  final int? line;

  @override
  List<Object?> get props => <Object?>[path, line];
}

/// The file a path of [text] names, **inside** [folder] — or `null`.
///
/// A relative path is the folder's; an absolute one is only when it starts with the folder.
/// Anything that climbs out (`..`), a URL, or a path to somewhere else stays text: only the
/// folder's files are opened from the viewer, through the files API, which fences them again.
FileLink? fileLinkOf(String text, String folder) {
  if (text.contains('://') || !_whole.hasMatch(text)) {
    return null;
  }

  final List<String> parts = text.split(':');
  final String rawPath = parts.first;
  final String? relative = rawPath.startsWith('/')
      ? _insideFolder(rawPath, folder)
      : rawPath.replaceFirst(RegExp(r'^\./'), '');

  if (relative == null || relative.isEmpty || relative.split('/').contains('..')) {
    return null;
  }

  return FileLink(path: relative, line: parts.length < 2 ? null : int.tryParse(parts[1]));
}

/// An absolute path, relative to [folder] — `null` when it is not inside it.
String? _insideFolder(String path, String folder) {
  final String prefix = '$folder/';
  return path.startsWith(prefix) ? path.substring(prefix.length) : null;
}

/// [FileLink] as the plain record [SafeMarkdown] takes, so `core/` never needs to know this type.
extension FileLinkRecord on FileLink {
  (String path, int? line) get record => (path, line);
}
