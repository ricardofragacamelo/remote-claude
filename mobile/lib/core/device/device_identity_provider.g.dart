// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'device_identity_provider.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The one installation identity. Kept alive: it is read by the transport on every call.

@ProviderFor(deviceIdentity)
final deviceIdentityProvider = DeviceIdentityProvider._();

/// The one installation identity. Kept alive: it is read by the transport on every call.

final class DeviceIdentityProvider
    extends $FunctionalProvider<DeviceIdentity, DeviceIdentity, DeviceIdentity>
    with $Provider<DeviceIdentity> {
  /// The one installation identity. Kept alive: it is read by the transport on every call.
  DeviceIdentityProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'deviceIdentityProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$deviceIdentityHash();

  @$internal
  @override
  $ProviderElement<DeviceIdentity> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  DeviceIdentity create(Ref ref) {
    return deviceIdentity(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(DeviceIdentity value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<DeviceIdentity>(value),
    );
  }
}

String _$deviceIdentityHash() => r'c9f3437afa66261f7b103aa5d1b23d1c345c6127';
