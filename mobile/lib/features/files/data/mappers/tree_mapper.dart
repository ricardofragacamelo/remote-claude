/// The answers of the file routes, read into entities (plan 25, B-09; plan 28, B-48).
///
/// Read by the generated types of the contract — after defaulting what is missing first: the
/// generated readers assert their fields, which is right for a frame this app built and wrong for
/// an answer from the network (`mobile/lib/core/network/contracts/frame_codec.dart`). A field the
/// contract requires but an older answer may not carry is defaulted the same way this build always
/// has, rather than costing the whole row or the whole answer.
///
/// Tolerant of what it does not know: an entry it cannot read is left out rather than costing the
/// level, and a kind it does not know is `other` — shown, never opened.
library;

import 'package:remote_claude/core/network/contracts/protocol.g.dart' as wire;
import 'package:remote_claude/features/files/domain/entities/file_entry.dart';
import 'package:remote_claude/features/files/domain/entities/file_limits.dart';
import 'package:remote_claude/features/files/domain/entities/text_document.dart';

int _intOr(Object? value, int fallback) =>
    value is int ? value : (value is num ? value.toInt() : fallback);

String _stringOr(Object? value, String fallback) => value is String ? value : fallback;

/// Whether [row] carries enough of its own identity to be shown at all — everything else about it
/// is defaulted.
bool _hasIdentity(Map<String, Object?> row) => row['name'] is String && row['path'] is String;

Map<String, Object?> _normalizedEntry(Map<String, Object?> row) => <String, Object?>{
  'name': row['name'],
  'path': row['path'],
  'kind': _stringOr(row['kind'], ''),
  'size': _intOr(row['size'], 0),
  'mtime': _stringOr(row['mtime'], ''),
  'hidden': row['hidden'] == true,
  'unreadableName': row['unreadableName'] == true,
  'outside': row['outside'] == true,
  'targetKind': row['targetKind'] is String ? row['targetKind'] : null,
};

/// The level `GET /files/tree` answered.
FileListing listingFrom(Object? payload) {
  final Map<String, Object?> body = payload is Map<String, Object?> ? payload : <String, Object?>{};
  final Object? rawEntries = body['entries'];

  final List<Object?> validRows = rawEntries is List<Object?>
      ? rawEntries
            .where((Object? row) => row is Map<String, Object?> && _hasIdentity(row))
            .map((Object? row) => _normalizedEntry(row! as Map<String, Object?>))
            .toList(growable: false)
      : const <Object?>[];

  final wire.FileTreePayload parsed = wire.FileTreePayload.fromJson(<String, Object?>{
    'folder': _stringOr(body['folder'], ''),
    'path': _stringOr(body['path'], ''),
    'entries': validRows,
    'truncated': body['truncated'] == true,
  });

  return FileListing(
    folder: parsed.folder,
    path: parsed.path,
    entries: parsed.entries.map(_entryFrom).toList(growable: false),
    truncated: parsed.truncated,
  );
}

/// The ceilings `GET /files/limits` answered — a missing one is `0`, which refuses rather than
/// promises.
FileLimits limitsFrom(Object? payload) {
  final Map<String, Object?> body = payload is Map<String, Object?> ? payload : <String, Object?>{};

  final wire.FileLimitsPayload parsed = wire.FileLimitsPayload.fromJson(<String, Object?>{
    'maxEditBytes': _intOr(body['maxEditBytes'], 0),
    'largeFileBytes': _intOr(body['largeFileBytes'], 0),
    'downloadMaxBytes': _intOr(body['downloadMaxBytes'], 0),
    'archiveMaxEntries': _intOr(body['archiveMaxEntries'], 0),
    'uploadMaxBytes': _intOr(body['uploadMaxBytes'], 0),
    'uploadMaxEntries': _intOr(body['uploadMaxEntries'], 0),
    'uploadMaxTotalBytes': _intOr(body['uploadMaxTotalBytes'], 0),
    'historyMaxFileBytes': _intOr(body['historyMaxFileBytes'], 0),
  });

  return FileLimits(
    maxTextBytes: parsed.maxEditBytes,
    largeFileBytes: parsed.largeFileBytes,
    downloadMaxBytes: parsed.downloadMaxBytes,
  );
}

/// The text `GET /files/content` answered — its version from the body, or the header when the body
/// has none.
TextDocument documentFrom(Object? payload, {String? etag}) {
  final Map<String, Object?> body = payload is Map<String, Object?> ? payload : <String, Object?>{};

  final wire.FileContentPayload parsed = wire.FileContentPayload.fromJson(<String, Object?>{
    'path': _stringOr(body['path'], ''),
    'content': _stringOr(body['content'], ''),
    'etag': _stringOr(body['etag'], etag ?? ''),
    'encoding': _stringOr(body['encoding'], 'utf8'),
    'bom': body['bom'] == true,
    'eol': _stringOr(body['eol'], 'lf'),
    'size': _intOr(body['size'], 0),
    'mtime': _stringOr(body['mtime'], ''),
    'largeFile': body['largeFile'] == true,
  });

  return TextDocument(
    path: parsed.path,
    content: parsed.content,
    etag: parsed.etag,
    encoding: parsed.encoding,
    eol: parsed.eol,
    size: parsed.size,
    largeFile: parsed.largeFile,
  );
}

FileEntry _entryFrom(wire.FileTreePayloadEntriesItem entry) => FileEntry(
  name: entry.name,
  path: entry.path,
  kind: _kindOf(entry.kind),
  size: entry.size,
  modifiedAt: DateTime.tryParse(entry.mtime),
  hidden: entry.hidden,
  unreadableName: entry.unreadableName,
  outside: entry.outside,
  targetKind: _targetOf(entry.targetKind),
);

EntryKind _kindOf(String value) => switch (value) {
  'file' => EntryKind.file,
  'directory' => EntryKind.directory,
  'symlink' => EntryKind.symlink,
  _ => EntryKind.other,
};

TargetKind? _targetOf(String? value) => switch (value) {
  'file' => TargetKind.file,
  'directory' => TargetKind.directory,
  'other' => TargetKind.other,
  'missing' => TargetKind.missing,
  _ => null,
};
