/// Opening, closing and finding folders.
library;

import 'package:remote_claude/features/workspace/domain/entities/folder.dart';
import 'package:remote_claude/features/workspace/domain/repositories/folder_repository.dart';

/// What the folders home and the picker do with folders — one use case, because every one of its
/// operations is the same rule: the list is the server's, shared with the browser (plan 10, D-25).
class ManageFolders {
  const ManageFolders(this._folders);

  final FolderRepository _folders;

  Future<List<OpenFolderEntry>> openFolders() => _folders.openFolders();

  Future<OpenFolderEntry> open(String path) => _folders.open(path);

  Future<void> close(String path) => _folders.close(path);

  Future<List<RecentFolder>> recent() => _folders.recent();

  Future<void> pin(String path, {required bool pinned}) => _folders.pin(path, pinned: pinned);

  Future<void> forget(String path) => _folders.forget(path);

  Future<DirectoryListing> directories(String path) => _folders.directories(path);
}
