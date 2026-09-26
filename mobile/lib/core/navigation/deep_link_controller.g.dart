// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'deep_link_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The location something asked the app to open, or `null` when there is nothing pending.

@ProviderFor(DeepLinkController)
final deepLinkControllerProvider = DeepLinkControllerProvider._();

/// The location something asked the app to open, or `null` when there is nothing pending.
final class DeepLinkControllerProvider extends $NotifierProvider<DeepLinkController, String?> {
  /// The location something asked the app to open, or `null` when there is nothing pending.
  DeepLinkControllerProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'deepLinkControllerProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$deepLinkControllerHash();

  @$internal
  @override
  DeepLinkController create() => DeepLinkController();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(String? value) {
    return $ProviderOverride(origin: this, providerOverride: $SyncValueProvider<String?>(value));
  }
}

String _$deepLinkControllerHash() => r'6ee24974487e1ba006440355c2dfd9a0885de415';

/// The location something asked the app to open, or `null` when there is nothing pending.

abstract class _$DeepLinkController extends $Notifier<String?> {
  String? build();
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<String?, String?>;
    final element =
        ref.element
            as $ClassProviderElement<AnyNotifier<String?, String?>, String?, Object?, Object?>;
    return element.handleCreate(ref, build);
  }
}
