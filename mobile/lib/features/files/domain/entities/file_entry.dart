/// One entry of a level of the open folder, as the panel lists it (plan 25, B-09).
library;

import 'package:equatable/equatable.dart';

/// What an entry is on disk.
enum EntryKind { file, directory, symlink, other }

/// What a link inside the folder leads to — `missing` when it is broken.
enum TargetKind { file, directory, other, missing }

/// One entry of a level.
class FileEntry extends Equatable {
  const FileEntry({
    required this.name,
    required this.path,
    required this.kind,
    this.size = 0,
    this.modifiedAt,
    this.hidden = false,
    this.unreadableName = false,
    this.outside = false,
    this.targetKind,
  });

  /// The last segment of [path].
  final String name;

  /// Relative to the open folder, POSIX — what every route asks for.
  final String path;

  final EntryKind kind;

  /// In bytes; meaningless for a folder.
  final int size;

  /// When it last changed, as the server said — `null` when it said nothing readable.
  final DateTime? modifiedAt;

  /// One of the names hidden unless "show hidden" is on — `.git`, `.DS_Store`… Marked by the
  /// server, filtered here.
  final bool hidden;

  /// The name is not UTF-8 on disk: shown, never opened.
  final bool unreadableName;

  /// A link that leads outside the open folder: shown, marked, never opened.
  final bool outside;

  /// What a link inside the folder leads to; `null` for anything but such a link.
  final TargetKind? targetKind;

  /// A folder, or a link inside the folder to one — what a tap enters.
  bool get isFolder =>
      kind == EntryKind.directory || (isLink && !outside && targetKind == TargetKind.directory);

  /// A link, whatever it leads to.
  bool get isLink => kind == EntryKind.symlink;

  /// A broken link inside the folder.
  bool get isBrokenLink => isLink && !outside && targetKind == TargetKind.missing;

  /// Why a tap does nothing — `null` when it opens or enters.
  Inert? get inert {
    if (outside) {
      return Inert.outsideLink;
    }
    if (isBrokenLink) {
      return Inert.brokenLink;
    }
    if (unreadableName) {
      return Inert.unreadableName;
    }
    if (kind == EntryKind.other || (isLink && targetKind == TargetKind.other)) {
      return Inert.notAFile;
    }
    return null;
  }

  @override
  List<Object?> get props => <Object?>[
    name,
    path,
    kind,
    size,
    modifiedAt,
    hidden,
    unreadableName,
    outside,
    targetKind,
  ];
}

/// Why an entry is shown but does not open.
enum Inert { outsideLink, brokenLink, unreadableName, notAFile }

/// One level of the folder, never more.
class FileListing extends Equatable {
  const FileListing({
    required this.folder,
    required this.path,
    required this.entries,
    this.truncated = false,
  });

  /// The open folder, absolute.
  final String folder;

  /// The level, relative to [folder] — `''` is the folder itself.
  final String path;

  /// Folders first, in the server's order.
  final List<FileEntry> entries;

  /// The level has more entries than the server lists (5 000).
  final bool truncated;

  @override
  List<Object?> get props => <Object?>[folder, path, entries, truncated];
}
