/// The answers of the file routes, read into entities (plan 25, B-09).
///
/// Tolerant of what it does not know: an entry it cannot read is left out rather than costing the
/// level, and a kind it does not know is `other` — shown, never opened.
library;

import 'package:remote_claude/features/files/domain/entities/file_entry.dart';
import 'package:remote_claude/features/files/domain/entities/file_limits.dart';
import 'package:remote_claude/features/files/domain/entities/text_document.dart';

/// The level `GET /files/tree` answered.
FileListing listingFrom(Object? payload) {
  final Map<String, Object?> body = payload is Map<String, Object?> ? payload : <String, Object?>{};
  final Object? rows = body['entries'];

  return FileListing(
    folder: _string(body['folder']) ?? '',
    path: _string(body['path']) ?? '',
    entries: rows is List<Object?>
        ? rows.map(_entryFrom).whereType<FileEntry>().toList(growable: false)
        : const <FileEntry>[],
    truncated: body['truncated'] == true,
  );
}

/// The ceilings `GET /files/limits` answered — a missing one is `0`, which refuses rather than
/// promises.
FileLimits limitsFrom(Object? payload) {
  final Map<String, Object?> body = payload is Map<String, Object?> ? payload : <String, Object?>{};

  return FileLimits(
    maxTextBytes: _int(body['maxEditBytes']),
    largeFileBytes: _int(body['largeFileBytes']),
    downloadMaxBytes: _int(body['downloadMaxBytes']),
  );
}

/// The text `GET /files/content` answered — its version from the body, or the header when the body
/// has none.
TextDocument documentFrom(Object? payload, {String? etag}) {
  final Map<String, Object?> body = payload is Map<String, Object?> ? payload : <String, Object?>{};

  return TextDocument(
    path: _string(body['path']) ?? '',
    content: _string(body['content']) ?? '',
    etag: _string(body['etag']) ?? etag ?? '',
    encoding: _string(body['encoding']) ?? 'utf8',
    eol: _string(body['eol']) ?? 'lf',
    size: _int(body['size']),
    largeFile: body['largeFile'] == true,
  );
}

FileEntry? _entryFrom(Object? row) {
  if (row is! Map<String, Object?>) {
    return null;
  }

  final String? name = _string(row['name']);
  final String? path = _string(row['path']);
  if (name == null || path == null) {
    return null;
  }

  return FileEntry(
    name: name,
    path: path,
    kind: _kindOf(row['kind']),
    size: _int(row['size']),
    modifiedAt: DateTime.tryParse(_string(row['mtime']) ?? ''),
    hidden: row['hidden'] == true,
    unreadableName: row['unreadableName'] == true,
    outside: row['outside'] == true,
    targetKind: _targetOf(row['targetKind']),
  );
}

EntryKind _kindOf(Object? value) => switch (value) {
  'file' => EntryKind.file,
  'directory' => EntryKind.directory,
  'symlink' => EntryKind.symlink,
  _ => EntryKind.other,
};

TargetKind? _targetOf(Object? value) => switch (value) {
  'file' => TargetKind.file,
  'directory' => TargetKind.directory,
  'other' => TargetKind.other,
  'missing' => TargetKind.missing,
  _ => null,
};

String? _string(Object? value) => value is String ? value : null;

int _int(Object? value) => value is int ? value : (value is num ? value.toInt() : 0);
