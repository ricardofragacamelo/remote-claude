// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ws_client_provider.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The one socket. Kept alive: it outlives every screen that watches it.

@ProviderFor(wsClient)
final wsClientProvider = WsClientProvider._();

/// The one socket. Kept alive: it outlives every screen that watches it.

final class WsClientProvider extends $FunctionalProvider<WsClient, WsClient, WsClient>
    with $Provider<WsClient> {
  /// The one socket. Kept alive: it outlives every screen that watches it.
  WsClientProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'wsClientProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$wsClientHash();

  @$internal
  @override
  $ProviderElement<WsClient> $createElement($ProviderPointer pointer) => $ProviderElement(pointer);

  @override
  WsClient create(Ref ref) {
    return wsClient(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(WsClient value) {
    return $ProviderOverride(origin: this, providerOverride: $SyncValueProvider<WsClient>(value));
  }
}

String _$wsClientHash() => r'97eb6cedb43c834c1bf6d71aa97955374fa9eee4';

/// Where the connection stands, for a screen to show.

@ProviderFor(connectionStatus)
final connectionStatusProvider = ConnectionStatusProvider._();

/// Where the connection stands, for a screen to show.

final class ConnectionStatusProvider
    extends
        $FunctionalProvider<
          AsyncValue<ConnectionStatus>,
          ConnectionStatus,
          Stream<ConnectionStatus>
        >
    with $FutureModifier<ConnectionStatus>, $StreamProvider<ConnectionStatus> {
  /// Where the connection stands, for a screen to show.
  ConnectionStatusProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'connectionStatusProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$connectionStatusHash();

  @$internal
  @override
  $StreamProviderElement<ConnectionStatus> $createElement($ProviderPointer pointer) =>
      $StreamProviderElement(pointer);

  @override
  Stream<ConnectionStatus> create(Ref ref) {
    return connectionStatus(ref);
  }
}

String _$connectionStatusHash() => r'c64e031f5c09b490d1d7888aa098a7bb040183da';
