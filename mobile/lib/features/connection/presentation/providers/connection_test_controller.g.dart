// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'connection_test_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The test of the address screen. Disposed with it.

@ProviderFor(ConnectionTestController)
final connectionTestControllerProvider = ConnectionTestControllerProvider._();

/// The test of the address screen. Disposed with it.
final class ConnectionTestControllerProvider
    extends $NotifierProvider<ConnectionTestController, ConnectionTest> {
  /// The test of the address screen. Disposed with it.
  ConnectionTestControllerProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'connectionTestControllerProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$connectionTestControllerHash();

  @$internal
  @override
  ConnectionTestController create() => ConnectionTestController();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(ConnectionTest value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<ConnectionTest>(value),
    );
  }
}

String _$connectionTestControllerHash() => r'e953150e2f10fd317b3017e5f7d74b82c88de75f';

/// The test of the address screen. Disposed with it.

abstract class _$ConnectionTestController extends $Notifier<ConnectionTest> {
  ConnectionTest build();
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<ConnectionTest, ConnectionTest>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<ConnectionTest, ConnectionTest>,
              ConnectionTest,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, build);
  }
}
