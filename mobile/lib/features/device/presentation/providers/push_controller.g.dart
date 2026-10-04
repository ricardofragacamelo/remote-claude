// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'push_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The notification side of this installation.

@ProviderFor(PushController)
final pushControllerProvider = PushControllerProvider._();

/// The notification side of this installation.
final class PushControllerProvider extends $AsyncNotifierProvider<PushController, PushReach> {
  /// The notification side of this installation.
  PushControllerProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'pushControllerProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$pushControllerHash();

  @$internal
  @override
  PushController create() => PushController();
}

String _$pushControllerHash() => r'88356c2ac800a670f9e721fc90b0ecca90c1476c';

/// The notification side of this installation.

abstract class _$PushController extends $AsyncNotifier<PushReach> {
  FutureOr<PushReach> build();
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<AsyncValue<PushReach>, PushReach>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<AsyncValue<PushReach>, PushReach>,
              AsyncValue<PushReach>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, build);
  }
}
