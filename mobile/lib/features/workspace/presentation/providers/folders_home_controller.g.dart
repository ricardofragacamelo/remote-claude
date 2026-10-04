// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'folders_home_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The open and recent folders, kept in step with the server — which the browser shares
/// (plan 10, D-25): every change is written there and read back, never kept only here.

@ProviderFor(FoldersHomeController)
final foldersHomeControllerProvider = FoldersHomeControllerProvider._();

/// The open and recent folders, kept in step with the server — which the browser shares
/// (plan 10, D-25): every change is written there and read back, never kept only here.
final class FoldersHomeControllerProvider
    extends $AsyncNotifierProvider<FoldersHomeController, FoldersHome> {
  /// The open and recent folders, kept in step with the server — which the browser shares
  /// (plan 10, D-25): every change is written there and read back, never kept only here.
  FoldersHomeControllerProvider._()
    : super(
        from: null,
        argument: null,
        retry: _neverRetry,
        name: r'foldersHomeControllerProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$foldersHomeControllerHash();

  @$internal
  @override
  FoldersHomeController create() => FoldersHomeController();
}

String _$foldersHomeControllerHash() => r'785d13cd80ed08f00563f652acf334151dd953c5';

/// The open and recent folders, kept in step with the server — which the browser shares
/// (plan 10, D-25): every change is written there and read back, never kept only here.

abstract class _$FoldersHomeController extends $AsyncNotifier<FoldersHome> {
  FutureOr<FoldersHome> build();
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<AsyncValue<FoldersHome>, FoldersHome>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<AsyncValue<FoldersHome>, FoldersHome>,
              AsyncValue<FoldersHome>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, build);
  }
}
