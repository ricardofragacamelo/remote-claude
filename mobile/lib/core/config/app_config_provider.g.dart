// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'app_config_provider.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// What the build was compiled with.
///
/// Overridden at boot with the values read from `--dart-define`. It throws by default on purpose: an
/// app running with configuration nobody supplied is the failure this is meant to prevent, and a
/// silent default would hide it.

@ProviderFor(buildConfig)
final buildConfigProvider = BuildConfigProvider._();

/// What the build was compiled with.
///
/// Overridden at boot with the values read from `--dart-define`. It throws by default on purpose: an
/// app running with configuration nobody supplied is the failure this is meant to prevent, and a
/// silent default would hide it.

final class BuildConfigProvider extends $FunctionalProvider<BuildConfig, BuildConfig, BuildConfig>
    with $Provider<BuildConfig> {
  /// What the build was compiled with.
  ///
  /// Overridden at boot with the values read from `--dart-define`. It throws by default on purpose: an
  /// app running with configuration nobody supplied is the failure this is meant to prevent, and a
  /// silent default would hide it.
  BuildConfigProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'buildConfigProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$buildConfigHash();

  @$internal
  @override
  $ProviderElement<BuildConfig> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  BuildConfig create(Ref ref) {
    return buildConfig(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(BuildConfig value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<BuildConfig>(value),
    );
  }
}

String _$buildConfigHash() => r'02bfd5cb65e67f67dc26eaf3166e6237dd7ccfe2';

/// The choice of address the phone had saved when the app started — read before the first frame,
/// and overridden at boot with it. `null`: none saved.

@ProviderFor(savedConnection)
final savedConnectionProvider = SavedConnectionProvider._();

/// The choice of address the phone had saved when the app started — read before the first frame,
/// and overridden at boot with it. `null`: none saved.

final class SavedConnectionProvider
    extends $FunctionalProvider<ConnectionChoice?, ConnectionChoice?, ConnectionChoice?>
    with $Provider<ConnectionChoice?> {
  /// The choice of address the phone had saved when the app started — read before the first frame,
  /// and overridden at boot with it. `null`: none saved.
  SavedConnectionProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'savedConnectionProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$savedConnectionHash();

  @$internal
  @override
  $ProviderElement<ConnectionChoice?> $createElement($ProviderPointer pointer) =>
      $ProviderElement(pointer);

  @override
  ConnectionChoice? create(Ref ref) {
    return savedConnection(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(ConnectionChoice? value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<ConnectionChoice?>(value),
    );
  }
}

String _$savedConnectionHash() => r'4ee04330cdc310153f494205c97467b1d8dd5c4f';

/// The address the app talks through, and the way to change it.

@ProviderFor(ConnectionController)
final connectionControllerProvider = ConnectionControllerProvider._();

/// The address the app talks through, and the way to change it.
final class ConnectionControllerProvider
    extends $NotifierProvider<ConnectionController, ConnectionSetting> {
  /// The address the app talks through, and the way to change it.
  ConnectionControllerProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'connectionControllerProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$connectionControllerHash();

  @$internal
  @override
  ConnectionController create() => ConnectionController();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(ConnectionSetting value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<ConnectionSetting>(value),
    );
  }
}

String _$connectionControllerHash() => r'4c9e2ac182c8d0ecf936002f696e0b0f3ad83573';

/// The address the app talks through, and the way to change it.

abstract class _$ConnectionController extends $Notifier<ConnectionSetting> {
  ConnectionSetting build();
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<ConnectionSetting, ConnectionSetting>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<ConnectionSetting, ConnectionSetting>,
              ConnectionSetting,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, build);
  }
}

/// The origin the app talks through, or `null` when there is none yet.

@ProviderFor(currentOrigin)
final currentOriginProvider = CurrentOriginProvider._();

/// The origin the app talks through, or `null` when there is none yet.

final class CurrentOriginProvider extends $FunctionalProvider<String?, String?, String?>
    with $Provider<String?> {
  /// The origin the app talks through, or `null` when there is none yet.
  CurrentOriginProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'currentOriginProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$currentOriginHash();

  @$internal
  @override
  $ProviderElement<String?> $createElement($ProviderPointer pointer) => $ProviderElement(pointer);

  @override
  String? create(Ref ref) {
    return currentOrigin(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(String? value) {
    return $ProviderOverride(origin: this, providerOverride: $SyncValueProvider<String?>(value));
  }
}

String _$currentOriginHash() => r'fef1021c60174630a1e95d13f3e9a58d7a5defce';

/// Whether there is an origin to talk through — what keeps the app on the address screen until there
/// is (D-17).

@ProviderFor(hasOrigin)
final hasOriginProvider = HasOriginProvider._();

/// Whether there is an origin to talk through — what keeps the app on the address screen until there
/// is (D-17).

final class HasOriginProvider extends $FunctionalProvider<bool, bool, bool> with $Provider<bool> {
  /// Whether there is an origin to talk through — what keeps the app on the address screen until there
  /// is (D-17).
  HasOriginProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'hasOriginProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$hasOriginHash();

  @$internal
  @override
  $ProviderElement<bool> $createElement($ProviderPointer pointer) => $ProviderElement(pointer);

  @override
  bool create(Ref ref) {
    return hasOrigin(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(bool value) {
    return $ProviderOverride(origin: this, providerOverride: $SyncValueProvider<bool>(value));
  }
}

String _$hasOriginHash() => r'5093a52c7055f0401f8075f77524da33b7b58c98';

/// The configuration, on the origin chosen.
///
/// It throws with no origin: everything that reads it sits behind the address screen, which the
/// router keeps on screen until there is one.

@ProviderFor(appConfig)
final appConfigProvider = AppConfigProvider._();

/// The configuration, on the origin chosen.
///
/// It throws with no origin: everything that reads it sits behind the address screen, which the
/// router keeps on screen until there is one.

final class AppConfigProvider extends $FunctionalProvider<AppConfig, AppConfig, AppConfig>
    with $Provider<AppConfig> {
  /// The configuration, on the origin chosen.
  ///
  /// It throws with no origin: everything that reads it sits behind the address screen, which the
  /// router keeps on screen until there is one.
  AppConfigProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'appConfigProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$appConfigHash();

  @$internal
  @override
  $ProviderElement<AppConfig> $createElement($ProviderPointer pointer) => $ProviderElement(pointer);

  @override
  AppConfig create(Ref ref) {
    return appConfig(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(AppConfig value) {
    return $ProviderOverride(origin: this, providerOverride: $SyncValueProvider<AppConfig>(value));
  }
}

String _$appConfigHash() => r'498e91f9b20ee756a9842447c43593bd22b3f70f';
