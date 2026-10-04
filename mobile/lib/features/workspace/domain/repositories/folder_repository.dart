/// What the folder use cases need from the outside world.
library;

import 'package:remote_claude/features/workspace/domain/entities/folder.dart';

/// The open folders, the recent ones and the picker, against the backend (plan 10, F7).
///
/// Every method throws a [Failure], never an exception of the transport:
/// `OPEN_FOLDERS_LIMIT_REACHED` past the ceiling, `WORKSPACE_*` for a folder that cannot be used.
abstract interface class FolderRepository {
  /// The open folders, in the order of the tabs.
  Future<List<OpenFolderEntry>> openFolders();

  /// Opens [path] in a tab — or answers the tab already open.
  Future<OpenFolderEntry> open(String path);

  /// Closes [path]'s tab. Ends no session of Claude; closing what is not open is not an error.
  Future<void> close(String path);

  /// The folders opened before, pinned first.
  Future<List<RecentFolder>> recent();

  /// Pins or unpins a recent folder.
  Future<void> pin(String path, {required bool pinned});

  /// Takes a folder off the recent list.
  Future<void> forget(String path);

  /// One level of [path].
  Future<DirectoryListing> directories(String path);
}
