/// The folder repository: the wire, turned into the entities the screens work with.
library;

import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/workspace/data/datasources/workspace_api_data_source.dart';
import 'package:remote_claude/features/workspace/data/mappers/folder_mapper.dart';
import 'package:remote_claude/features/workspace/domain/entities/folder.dart';
import 'package:remote_claude/features/workspace/domain/repositories/folder_repository.dart';

/// [FolderRepository] over the backend's HTTP API. The client already turns every refusal into a
/// [Failure]; what is left here is an answer that is not the shape it claims.
class FolderRepositoryImpl implements FolderRepository {
  const FolderRepositoryImpl(this._api);

  final WorkspaceApiDataSource _api;

  @override
  Future<List<OpenFolderEntry>> openFolders() async => openFoldersFrom(await _api.openFolders());

  @override
  Future<OpenFolderEntry> open(String path) async =>
      openFolderFrom(await _api.openFolder(path)) ?? (throw _unreadable());

  @override
  Future<void> close(String path) => _api.closeFolder(path);

  @override
  Future<List<RecentFolder>> recent() async => recentFoldersFrom(await _api.recent());

  @override
  Future<void> pin(String path, {required bool pinned}) => _api.pinRecent(path, pinned: pinned);

  @override
  Future<void> forget(String path) => _api.forgetRecent(path);

  @override
  Future<DirectoryListing> directories(String path) async =>
      directoryListingFrom(await _api.directories(path)) ?? (throw _unreadable());

  static Failure _unreadable() => const UnexpectedFailure(traceId: unknownTraceId);
}
