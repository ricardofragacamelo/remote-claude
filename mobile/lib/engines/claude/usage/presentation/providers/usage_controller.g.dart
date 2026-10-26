// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'usage_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The screen's one read: every window the backend has last observed, in no particular order —
/// the screen itself decides how to lay them out.

@ProviderFor(UsageController)
final usageControllerProvider = UsageControllerProvider._();

/// The screen's one read: every window the backend has last observed, in no particular order —
/// the screen itself decides how to lay them out.
final class UsageControllerProvider
    extends $AsyncNotifierProvider<UsageController, List<RateLimitWindow>> {
  /// The screen's one read: every window the backend has last observed, in no particular order —
  /// the screen itself decides how to lay them out.
  UsageControllerProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'usageControllerProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$usageControllerHash();

  @$internal
  @override
  UsageController create() => UsageController();
}

String _$usageControllerHash() => r'ece292811b98c26881bd57a2c0241d39371591fa';

/// The screen's one read: every window the backend has last observed, in no particular order —
/// the screen itself decides how to lay them out.

abstract class _$UsageController extends $AsyncNotifier<List<RateLimitWindow>> {
  FutureOr<List<RateLimitWindow>> build();
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<AsyncValue<List<RateLimitWindow>>, List<RateLimitWindow>>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<AsyncValue<List<RateLimitWindow>>, List<RateLimitWindow>>,
              AsyncValue<List<RateLimitWindow>>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, build);
  }
}
