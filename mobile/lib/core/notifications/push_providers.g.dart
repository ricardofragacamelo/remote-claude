// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'push_providers.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The one gateway. Kept alive: a notification arrives whether or not a screen is listening.

@ProviderFor(pushGateway)
final pushGatewayProvider = PushGatewayProvider._();

/// The one gateway. Kept alive: a notification arrives whether or not a screen is listening.

final class PushGatewayProvider extends $FunctionalProvider<PushGateway, PushGateway, PushGateway>
    with $Provider<PushGateway> {
  /// The one gateway. Kept alive: a notification arrives whether or not a screen is listening.
  PushGatewayProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'pushGatewayProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$pushGatewayHash();

  @$internal
  @override
  $ProviderElement<PushGateway> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  PushGateway create(Ref ref) {
    return pushGateway(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(PushGateway value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<PushGateway>(value),
    );
  }
}

String _$pushGatewayHash() => r'601bffabed2d69ae21d9059f03ff08939b565bbd';
