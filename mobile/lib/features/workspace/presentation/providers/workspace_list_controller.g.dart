// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'workspace_list_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The roots a session may be opened in.
///
/// An `AsyncNotifier` and not a plain future provider, because the screen has a retry: the four
/// states a loading screen owes the person include one they can act on, and acting on it means
/// asking again from here (docs/architecture/mobile/04-ui.md).

@ProviderFor(WorkspaceListController)
final workspaceListControllerProvider = WorkspaceListControllerProvider._();

/// The roots a session may be opened in.
///
/// An `AsyncNotifier` and not a plain future provider, because the screen has a retry: the four
/// states a loading screen owes the person include one they can act on, and acting on it means
/// asking again from here (docs/architecture/mobile/04-ui.md).
final class WorkspaceListControllerProvider
    extends $AsyncNotifierProvider<WorkspaceListController, List<Workspace>> {
  /// The roots a session may be opened in.
  ///
  /// An `AsyncNotifier` and not a plain future provider, because the screen has a retry: the four
  /// states a loading screen owes the person include one they can act on, and acting on it means
  /// asking again from here (docs/architecture/mobile/04-ui.md).
  WorkspaceListControllerProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'workspaceListControllerProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$workspaceListControllerHash();

  @$internal
  @override
  WorkspaceListController create() => WorkspaceListController();
}

String _$workspaceListControllerHash() => r'a353f61edcef16b194b76149f7935ec67d79228e';

/// The roots a session may be opened in.
///
/// An `AsyncNotifier` and not a plain future provider, because the screen has a retry: the four
/// states a loading screen owes the person include one they can act on, and acting on it means
/// asking again from here (docs/architecture/mobile/04-ui.md).

abstract class _$WorkspaceListController extends $AsyncNotifier<List<Workspace>> {
  FutureOr<List<Workspace>> build();
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<AsyncValue<List<Workspace>>, List<Workspace>>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<AsyncValue<List<Workspace>>, List<Workspace>>,
              AsyncValue<List<Workspace>>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, build);
  }
}
