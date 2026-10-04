// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'connection_providers.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The test of an address.

@ProviderFor(connectionProbe)
final connectionProbeProvider = ConnectionProbeProvider._();

/// The test of an address.

final class ConnectionProbeProvider
    extends $FunctionalProvider<ConnectionProbe, ConnectionProbe, ConnectionProbe>
    with $Provider<ConnectionProbe> {
  /// The test of an address.
  ConnectionProbeProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'connectionProbeProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$connectionProbeHash();

  @$internal
  @override
  $ProviderElement<ConnectionProbe> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  ConnectionProbe create(Ref ref) {
    return connectionProbe(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(ConnectionProbe value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<ConnectionProbe>(value),
    );
  }
}

String _$connectionProbeHash() => r'ea39a8ee24be7d5425402270e37bccb342bc0d92';
