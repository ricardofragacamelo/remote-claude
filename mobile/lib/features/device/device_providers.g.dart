// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'device_providers.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// Which operating system this build is running on.
///
/// Overridden in a test, because `dart:io` answers the host there and the registration would
/// claim a platform the contract does not accept.

@ProviderFor(devicePlatform)
final devicePlatformProvider = DevicePlatformProvider._();

/// Which operating system this build is running on.
///
/// Overridden in a test, because `dart:io` answers the host there and the registration would
/// claim a platform the contract does not accept.

final class DevicePlatformProvider extends $FunctionalProvider<String, String, String>
    with $Provider<String> {
  /// Which operating system this build is running on.
  ///
  /// Overridden in a test, because `dart:io` answers the host there and the registration would
  /// claim a platform the contract does not accept.
  DevicePlatformProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'devicePlatformProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$devicePlatformHash();

  @$internal
  @override
  $ProviderElement<String> $createElement($ProviderPointer pointer) => $ProviderElement(pointer);

  @override
  String create(Ref ref) {
    return devicePlatform(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(String value) {
    return $ProviderOverride(origin: this, providerOverride: $SyncValueProvider<String>(value));
  }
}

String _$devicePlatformHash() => r'b43d2789a73f01b3b4cf99d1e2c485a21e3c9468';

/// What the person will recognise in the approval list.
///
/// The operating system and its version, from `dart:io` — deliberately not a plugin. A model name
/// would read better and would cost a platform channel on both platforms; the version is honest,
/// needs nothing, and the list is per account rather than per fleet.

@ProviderFor(deviceName)
final deviceNameProvider = DeviceNameProvider._();

/// What the person will recognise in the approval list.
///
/// The operating system and its version, from `dart:io` — deliberately not a plugin. A model name
/// would read better and would cost a platform channel on both platforms; the version is honest,
/// needs nothing, and the list is per account rather than per fleet.

final class DeviceNameProvider extends $FunctionalProvider<String, String, String>
    with $Provider<String> {
  /// What the person will recognise in the approval list.
  ///
  /// The operating system and its version, from `dart:io` — deliberately not a plugin. A model name
  /// would read better and would cost a platform channel on both platforms; the version is honest,
  /// needs nothing, and the list is per account rather than per fleet.
  DeviceNameProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'deviceNameProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$deviceNameHash();

  @$internal
  @override
  $ProviderElement<String> $createElement($ProviderPointer pointer) => $ProviderElement(pointer);

  @override
  String create(Ref ref) {
    return deviceName(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(String value) {
    return $ProviderOverride(origin: this, providerOverride: $SyncValueProvider<String>(value));
  }
}

String _$deviceNameHash() => r'3975cb11490d7548c00371787759c93ba96d2001';

/// The device's edge of the backend.

@ProviderFor(deviceApiDataSource)
final deviceApiDataSourceProvider = DeviceApiDataSourceProvider._();

/// The device's edge of the backend.

final class DeviceApiDataSourceProvider
    extends $FunctionalProvider<DeviceApiDataSource, DeviceApiDataSource, DeviceApiDataSource>
    with $Provider<DeviceApiDataSource> {
  /// The device's edge of the backend.
  DeviceApiDataSourceProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'deviceApiDataSourceProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$deviceApiDataSourceHash();

  @$internal
  @override
  $ProviderElement<DeviceApiDataSource> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  DeviceApiDataSource create(Ref ref) {
    return deviceApiDataSource(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(DeviceApiDataSource value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<DeviceApiDataSource>(value),
    );
  }
}

String _$deviceApiDataSourceHash() => r'8b41be635589bd6b309afe92e68ccc0e498ecf77';

/// The device repository.

@ProviderFor(deviceRepository)
final deviceRepositoryProvider = DeviceRepositoryProvider._();

/// The device repository.

final class DeviceRepositoryProvider
    extends $FunctionalProvider<DeviceRepository, DeviceRepository, DeviceRepository>
    with $Provider<DeviceRepository> {
  /// The device repository.
  DeviceRepositoryProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'deviceRepositoryProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$deviceRepositoryHash();

  @$internal
  @override
  $ProviderElement<DeviceRepository> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  DeviceRepository create(Ref ref) {
    return deviceRepository(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(DeviceRepository value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<DeviceRepository>(value),
    );
  }
}

String _$deviceRepositoryHash() => r'98005b01436fce0d03e50c004f61cf18d6bcb83e';

/// Registers this installation.

@ProviderFor(registerDevice)
final registerDeviceProvider = RegisterDeviceProvider._();

/// Registers this installation.

final class RegisterDeviceProvider
    extends $FunctionalProvider<RegisterDevice, RegisterDevice, RegisterDevice>
    with $Provider<RegisterDevice> {
  /// Registers this installation.
  RegisterDeviceProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'registerDeviceProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$registerDeviceHash();

  @$internal
  @override
  $ProviderElement<RegisterDevice> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  RegisterDevice create(Ref ref) {
    return registerDevice(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(RegisterDevice value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<RegisterDevice>(value),
    );
  }
}

String _$registerDeviceHash() => r'3cb57a5e764bea4ad7aeee9c186af52822e628a4';

/// Forgets this installation's push token, on the backend.

@ProviderFor(forgetPushToken)
final forgetPushTokenProvider = ForgetPushTokenProvider._();

/// Forgets this installation's push token, on the backend.

final class ForgetPushTokenProvider
    extends $FunctionalProvider<ForgetPushToken, ForgetPushToken, ForgetPushToken>
    with $Provider<ForgetPushToken> {
  /// Forgets this installation's push token, on the backend.
  ForgetPushTokenProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'forgetPushTokenProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$forgetPushTokenHash();

  @$internal
  @override
  $ProviderElement<ForgetPushToken> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  ForgetPushToken create(Ref ref) {
    return forgetPushToken(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(ForgetPushToken value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<ForgetPushToken>(value),
    );
  }
}

String _$forgetPushTokenHash() => r'a6d02c425f9b38804cd007dc8b383346fbe374b5';

/// Reads where this installation stands.

@ProviderFor(checkDevice)
final checkDeviceProvider = CheckDeviceProvider._();

/// Reads where this installation stands.

final class CheckDeviceProvider extends $FunctionalProvider<CheckDevice, CheckDevice, CheckDevice>
    with $Provider<CheckDevice> {
  /// Reads where this installation stands.
  CheckDeviceProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'checkDeviceProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$checkDeviceHash();

  @$internal
  @override
  $ProviderElement<CheckDevice> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  CheckDevice create(Ref ref) {
    return checkDevice(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(CheckDevice value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<CheckDevice>(value),
    );
  }
}

String _$checkDeviceHash() => r'22c19dc01ba93c972b65c2dcc46c59516bfbcfe6';
