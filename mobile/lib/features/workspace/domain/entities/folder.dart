/// The folders a person opened — the same list as the browser's folder tabs (plan 10, D-25) — the
/// ones they opened before, and one level of a folder, for the picker.
///
/// Pure Dart: no `flutter/*`, no `dio`.
library;

import 'package:equatable/equatable.dart';

/// Whether an open or recent folder can still be used, as the backend revalidates it on every read.
enum FolderState {
  /// It is there, and still inside a root of this person.
  available,

  /// It left the allowlist.
  notAllowed,

  /// It is no longer on the disk.
  missing,
}

/// The last segment of [path] — what a person recognises in a list.
String folderNameOf(String path) {
  final List<String> segments = path
      .split('/')
      .where((String segment) => segment.isNotEmpty)
      .toList(growable: false);

  return segments.isEmpty ? path : segments.last;
}

/// A folder open in a tab, here and in the browser.
class OpenFolderEntry extends Equatable {
  const OpenFolderEntry({required this.path, required this.state, this.rootLabel});

  /// Absolute, as the backend resolved it.
  final String path;

  /// The label of the root it lives under, or `null` once it lives under none.
  final String? rootLabel;

  final FolderState state;

  /// The folder's own name.
  String get name => folderNameOf(path);

  /// Whether it can be opened: a folder that left the roots or the disk is shown, marked, and
  /// not opened.
  bool get usable => state == FolderState.available;

  @override
  List<Object?> get props => <Object?>[path, rootLabel, state];
}

/// A folder this person opened before.
class RecentFolder extends Equatable {
  const RecentFolder({
    required this.path,
    required this.lastOpenedAt,
    required this.pinned,
    required this.available,
    this.rootLabel,
  });

  final String path;
  final String? rootLabel;
  final DateTime lastOpenedAt;
  final bool pinned;

  /// `false` for a folder that left the allowlist or the disk — marked rather than dropped.
  final bool available;

  String get name => folderNameOf(path);

  @override
  List<Object?> get props => <Object?>[path, rootLabel, lastOpenedAt, pinned, available];
}

/// One subdirectory of a listing.
class DirectoryEntry extends Equatable {
  const DirectoryEntry({required this.name, required this.path, this.hidden = false});

  final String name;
  final String path;
  final bool hidden;

  @override
  List<Object?> get props => <Object?>[name, path, hidden];
}

/// One level of a folder, and where "up" goes — never above its root.
class DirectoryListing extends Equatable {
  const DirectoryListing({
    required this.path,
    required this.rootLabel,
    required this.entries,
    required this.truncated,
    this.parent,
  });

  final String path;
  final String rootLabel;

  /// `null` at the root: the picker never climbs above it.
  final String? parent;
  final List<DirectoryEntry> entries;

  /// The ceiling cut the listing.
  final bool truncated;

  @override
  List<Object?> get props => <Object?>[path, rootLabel, parent, entries, truncated];
}
