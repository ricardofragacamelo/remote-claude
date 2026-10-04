// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'workspace_providers.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The workspace's edge of the backend.

@ProviderFor(workspaceApiDataSource)
final workspaceApiDataSourceProvider = WorkspaceApiDataSourceProvider._();

/// The workspace's edge of the backend.

final class WorkspaceApiDataSourceProvider
    extends
        $FunctionalProvider<WorkspaceApiDataSource, WorkspaceApiDataSource, WorkspaceApiDataSource>
    with $Provider<WorkspaceApiDataSource> {
  /// The workspace's edge of the backend.
  WorkspaceApiDataSourceProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'workspaceApiDataSourceProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$workspaceApiDataSourceHash();

  @$internal
  @override
  $ProviderElement<WorkspaceApiDataSource> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  WorkspaceApiDataSource create(Ref ref) {
    return workspaceApiDataSource(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(WorkspaceApiDataSource value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<WorkspaceApiDataSource>(value),
    );
  }
}

String _$workspaceApiDataSourceHash() => r'1b739fc8c140fb4e1e552d9c46858ecff8771fb7';

/// The workspace repository.

@ProviderFor(workspaceRepository)
final workspaceRepositoryProvider = WorkspaceRepositoryProvider._();

/// The workspace repository.

final class WorkspaceRepositoryProvider
    extends $FunctionalProvider<WorkspaceRepository, WorkspaceRepository, WorkspaceRepository>
    with $Provider<WorkspaceRepository> {
  /// The workspace repository.
  WorkspaceRepositoryProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'workspaceRepositoryProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$workspaceRepositoryHash();

  @$internal
  @override
  $ProviderElement<WorkspaceRepository> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  WorkspaceRepository create(Ref ref) {
    return workspaceRepository(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(WorkspaceRepository value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<WorkspaceRepository>(value),
    );
  }
}

String _$workspaceRepositoryHash() => r'7474f671d74e2b7350c9bbdaffaa07431b22d7aa';

/// Reads the allowlist.

@ProviderFor(listWorkspaces)
final listWorkspacesProvider = ListWorkspacesProvider._();

/// Reads the allowlist.

final class ListWorkspacesProvider
    extends $FunctionalProvider<ListWorkspaces, ListWorkspaces, ListWorkspaces>
    with $Provider<ListWorkspaces> {
  /// Reads the allowlist.
  ListWorkspacesProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'listWorkspacesProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$listWorkspacesHash();

  @$internal
  @override
  $ProviderElement<ListWorkspaces> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  ListWorkspaces create(Ref ref) {
    return listWorkspaces(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(ListWorkspaces value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<ListWorkspaces>(value),
    );
  }
}

String _$listWorkspacesHash() => r'28bc88edd13cafdaaeebed86da9353d28abdad34';

/// The folder repository: open folders, recent ones and the picker (plan 10, F7).

@ProviderFor(folderRepository)
final folderRepositoryProvider = FolderRepositoryProvider._();

/// The folder repository: open folders, recent ones and the picker (plan 10, F7).

final class FolderRepositoryProvider
    extends $FunctionalProvider<FolderRepository, FolderRepository, FolderRepository>
    with $Provider<FolderRepository> {
  /// The folder repository: open folders, recent ones and the picker (plan 10, F7).
  FolderRepositoryProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'folderRepositoryProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$folderRepositoryHash();

  @$internal
  @override
  $ProviderElement<FolderRepository> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  FolderRepository create(Ref ref) {
    return folderRepository(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(FolderRepository value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<FolderRepository>(value),
    );
  }
}

String _$folderRepositoryHash() => r'9c30e1985a404409fa1d9502049d342c41541094';

/// Opens, closes and finds folders.

@ProviderFor(manageFolders)
final manageFoldersProvider = ManageFoldersProvider._();

/// Opens, closes and finds folders.

final class ManageFoldersProvider
    extends $FunctionalProvider<ManageFolders, ManageFolders, ManageFolders>
    with $Provider<ManageFolders> {
  /// Opens, closes and finds folders.
  ManageFoldersProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'manageFoldersProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$manageFoldersHash();

  @$internal
  @override
  $ProviderElement<ManageFolders> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  ManageFolders create(Ref ref) {
    return manageFolders(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(ManageFolders value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<ManageFolders>(value),
    );
  }
}

String _$manageFoldersHash() => r'27b7b44908879bcd37c38394a5b9d9f6e0dc2e23';
