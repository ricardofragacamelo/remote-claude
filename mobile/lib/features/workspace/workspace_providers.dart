/// Wiring of the workspace feature: its composition root.
///
/// Same reason as the auth feature's — see `auth_providers.dart`.
library;

import 'package:remote_claude/core/network/api_client_provider.dart';
import 'package:remote_claude/features/workspace/data/datasources/workspace_api_data_source.dart';
import 'package:remote_claude/features/workspace/data/repositories/folder_repository_impl.dart';
import 'package:remote_claude/features/workspace/data/repositories/workspace_repository_impl.dart';
import 'package:remote_claude/features/workspace/domain/repositories/folder_repository.dart';
import 'package:remote_claude/features/workspace/domain/repositories/workspace_repository.dart';
import 'package:remote_claude/features/workspace/domain/usecases/list_workspaces.dart';
import 'package:remote_claude/features/workspace/domain/usecases/manage_folders.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'workspace_providers.g.dart';

/// The workspace's edge of the backend.
@Riverpod(keepAlive: true)
WorkspaceApiDataSource workspaceApiDataSource(Ref ref) =>
    HttpWorkspaceApiDataSource(ref.watch(apiClientProvider));

/// The workspace repository.
@Riverpod(keepAlive: true)
WorkspaceRepository workspaceRepository(Ref ref) =>
    WorkspaceRepositoryImpl(ref.watch(workspaceApiDataSourceProvider));

/// Reads the allowlist.
@Riverpod(keepAlive: true)
ListWorkspaces listWorkspaces(Ref ref) => ListWorkspaces(ref.watch(workspaceRepositoryProvider));

/// The folder repository: open folders, recent ones and the picker (plan 10, F7).
@Riverpod(keepAlive: true)
FolderRepository folderRepository(Ref ref) =>
    FolderRepositoryImpl(ref.watch(workspaceApiDataSourceProvider));

/// Opens, closes and finds folders.
@Riverpod(keepAlive: true)
ManageFolders manageFolders(Ref ref) => ManageFolders(ref.watch(folderRepositoryProvider));
