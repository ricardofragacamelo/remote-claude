/// Reads the backend's folder payloads as entities (plan 06; plan 28, B-48).
///
/// Read by the generated types of the contract — after checking the shape first: the generated
/// readers assert their fields, which is right for a frame this app built and wrong for an answer
/// from the network (`mobile/lib/core/network/contracts/frame_codec.dart`).
///
/// A row of a list that cannot be read is dropped — one malformed folder should cost the person
/// that row, not the screen — and a single answer that cannot be read is `null`, for the
/// repository to turn into a failure.
library;

import 'package:remote_claude/core/network/contracts/protocol.g.dart' as wire;
import 'package:remote_claude/features/workspace/domain/entities/folder.dart';

FolderState? _stateFrom(String raw) => switch (raw) {
  'available' => FolderState.available,
  'notAllowed' => FolderState.notAllowed,
  'missing' => FolderState.missing,
  _ => null,
};

bool _looksLikeOpenFolder(Map<String, Object?> entry) =>
    entry['path'] is String &&
    entry['state'] is String &&
    (entry['rootLabel'] == null || entry['rootLabel'] is String);

/// One open folder, or `null` when [entry] is not one.
OpenFolderEntry? openFolderFrom(Object? entry) {
  if (entry is! Map<String, Object?> || !_looksLikeOpenFolder(entry)) {
    return null;
  }

  final wire.OpenFolderEntryPayload body = wire.OpenFolderEntryPayload.fromJson(entry);
  final FolderState? state = _stateFrom(body.state);

  return state == null
      ? null
      : OpenFolderEntry(path: body.path, state: state, rootLabel: body.rootLabel);
}

/// The open folders, in the order of the tabs — the unreadable ones dropped.
List<OpenFolderEntry> openFoldersFrom(Object? payload) {
  final Object? rawList = payload is Map<String, Object?> ? payload['folders'] : null;

  if (rawList is! List<Object?>) {
    return const <OpenFolderEntry>[];
  }

  final List<Object?> validRows = rawList
      .where((Object? entry) => entry is Map<String, Object?> && _looksLikeOpenFolder(entry))
      .toList(growable: false);

  final wire.OpenFoldersPayload body = wire.OpenFoldersPayload.fromJson(<String, Object?>{
    'folders': validRows,
  });

  return <OpenFolderEntry>[
    for (final wire.OpenFolderEntry entry in body.folders)
      if (_stateFrom(entry.state) case final FolderState state)
        OpenFolderEntry(path: entry.path, state: state, rootLabel: entry.rootLabel),
  ];
}

bool _looksLikeRecentFolder(Map<String, Object?> entry) =>
    entry['path'] is String &&
    entry['lastOpenedAt'] is String &&
    DateTime.tryParse(entry['lastOpenedAt']! as String) != null &&
    entry['pinned'] is bool &&
    entry['available'] is bool &&
    (entry['rootLabel'] == null || entry['rootLabel'] is String);

RecentFolder _recentFolderFrom(wire.RecentFoldersPayloadFoldersItem entry) => RecentFolder(
  path: entry.path,
  rootLabel: entry.rootLabel,
  lastOpenedAt: DateTime.parse(entry.lastOpenedAt).toUtc(),
  pinned: entry.pinned,
  available: entry.available,
);

/// The recent folders, in the order the backend gave them — pinned first — the unreadable ones
/// dropped.
List<RecentFolder> recentFoldersFrom(Object? payload) {
  final Object? rawList = payload is Map<String, Object?> ? payload['folders'] : null;

  if (rawList is! List<Object?>) {
    return const <RecentFolder>[];
  }

  final List<Object?> validRows = rawList
      .where((Object? entry) => entry is Map<String, Object?> && _looksLikeRecentFolder(entry))
      .toList(growable: false);

  final wire.RecentFoldersPayload body = wire.RecentFoldersPayload.fromJson(<String, Object?>{
    'folders': validRows,
  });

  return body.folders.map(_recentFolderFrom).toList(growable: false);
}

/// Whether [entry] carries enough of its own identity to be shown at all — `hidden` and `symlink`
/// are defaulted when a row does not carry them.
bool _hasIdentity(Map<String, Object?> entry) => entry['name'] is String && entry['path'] is String;

Map<String, Object?> _normalizedDirectoryEntry(Map<String, Object?> entry) => <String, Object?>{
  'name': entry['name'],
  'path': entry['path'],
  'hidden': entry['hidden'] == true,
  'symlink': entry['symlink'] == true,
};

DirectoryEntry _directoryEntryFrom(wire.DirectoryListingPayloadEntriesItem entry) =>
    DirectoryEntry(name: entry.name, path: entry.path, hidden: entry.hidden);

/// Whether [root] carries what the screen shows of it — its label. The root's own `path` is part
/// of the contract but this build never reads it, so it is defaulted rather than required.
bool _looksLikeRoot(Object? root) => root is Map<String, Object?> && root['label'] is String;

/// One level of a folder, or `null` when [payload] is not one.
DirectoryListing? directoryListingFrom(Object? payload) {
  if (payload is! Map<String, Object?> ||
      payload['path'] is! String ||
      !_looksLikeRoot(payload['root']) ||
      (payload['parent'] != null && payload['parent'] is! String)) {
    return null;
  }

  final Object? rawEntries = payload['entries'];
  final List<Object?> validRows = rawEntries is List<Object?>
      ? rawEntries
            .where((Object? entry) => entry is Map<String, Object?> && _hasIdentity(entry))
            .map((Object? entry) => _normalizedDirectoryEntry(entry! as Map<String, Object?>))
            .toList(growable: false)
      : const <Object?>[];
  final Map<String, Object?> root = payload['root']! as Map<String, Object?>;

  final wire.DirectoryListingPayload body = wire.DirectoryListingPayload.fromJson(<String, Object?>{
    'path': payload['path'],
    'root': <String, Object?>{
      'path': root['path'] is String ? root['path'] : '',
      'label': root['label'],
      'lastUsedAt': root['lastUsedAt'] is String ? root['lastUsedAt'] : null,
    },
    'parent': payload['parent'],
    'entries': validRows,
    'truncated': payload['truncated'] == true,
  });

  return DirectoryListing(
    path: body.path,
    rootLabel: body.root.label,
    parent: body.parent,
    entries: body.entries.map(_directoryEntryFrom).toList(growable: false),
    truncated: body.truncated,
  );
}
