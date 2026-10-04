/// Reads the backend's folder payloads as entities.
///
/// A row of a list that cannot be read is dropped — one malformed folder should cost the person
/// that row, not the screen — and a single answer that cannot be read is `null`, for the
/// repository to turn into a failure.
library;

import 'package:remote_claude/features/workspace/data/mappers/rows.dart';
import 'package:remote_claude/features/workspace/domain/entities/folder.dart';

FolderState? _stateFrom(Object? raw) => switch (raw) {
  'available' => FolderState.available,
  'notAllowed' => FolderState.notAllowed,
  'missing' => FolderState.missing,
  _ => null,
};

/// [raw] when it is a string, `null` otherwise.
String? _text(Object? raw) => raw is String ? raw : null;

/// One open folder, or `null` when [entry] is not one.
OpenFolderEntry? openFolderFrom(Object? entry) => switch (entry) {
  {'path': final String path, 'state': final Object? raw} when _stateFrom(raw) != null =>
    OpenFolderEntry(
      path: path,
      state: _stateFrom(raw)!,
      rootLabel: _text((entry as Map<String, Object?>)['rootLabel']),
    ),
  _ => null,
};

/// The open folders, in the order of the tabs.
List<OpenFolderEntry> openFoldersFrom(Object? payload) =>
    rowsOf(payload, 'folders', openFolderFrom);

/// One recent folder, or `null` when [entry] is not one.
RecentFolder? recentFolderFrom(Object? entry) => switch (entry) {
  {
    'path': final String path,
    'lastOpenedAt': final String opened,
    'pinned': final bool pinned,
    'available': final bool available,
  }
      when DateTime.tryParse(opened) != null =>
    RecentFolder(
      path: path,
      rootLabel: _text((entry as Map<String, Object?>)['rootLabel']),
      lastOpenedAt: DateTime.parse(opened).toUtc(),
      pinned: pinned,
      available: available,
    ),
  _ => null,
};

/// The recent folders, in the order the backend gave them — pinned first.
List<RecentFolder> recentFoldersFrom(Object? payload) =>
    rowsOf(payload, 'folders', recentFolderFrom);

DirectoryEntry? _entryFrom(Object? entry) => switch (entry) {
  {'name': final String name, 'path': final String path} => DirectoryEntry(
    name: name,
    path: path,
    hidden: (entry as Map<String, Object?>)['hidden'] == true,
  ),
  _ => null,
};

/// One level of a folder, or `null` when [payload] is not one.
DirectoryListing? directoryListingFrom(Object? payload) => switch (payload) {
  {'path': final String path, 'root': {'label': final String label}} => DirectoryListing(
    path: path,
    rootLabel: label,
    parent: _text((payload as Map<String, Object?>)['parent']),
    entries: rowsOf(payload, 'entries', _entryFrom),
    truncated: payload['truncated'] == true,
  ),
  _ => null,
};
