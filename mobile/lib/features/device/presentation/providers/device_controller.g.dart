// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'device_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning

@ProviderFor(DeviceController)
final deviceControllerProvider = DeviceControllerProvider._();

final class DeviceControllerProvider
    extends $AsyncNotifierProvider<DeviceController, RegisteredDevice?> {
  DeviceControllerProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'deviceControllerProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$deviceControllerHash();

  @$internal
  @override
  DeviceController create() => DeviceController();
}

String _$deviceControllerHash() => r'f0aafd460d1e2140a059a634073436699ac1d6d4';

abstract class _$DeviceController extends $AsyncNotifier<RegisteredDevice?> {
  FutureOr<RegisteredDevice?> build();
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<AsyncValue<RegisteredDevice?>, RegisteredDevice?>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<AsyncValue<RegisteredDevice?>, RegisteredDevice?>,
              AsyncValue<RegisteredDevice?>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, build);
  }
}
