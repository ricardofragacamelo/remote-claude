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
