// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'app_config_provider.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The configuration.
///
/// Overridden at boot with the values read from `--dart-define`. It throws by default on
/// purpose: an app running with configuration nobody supplied is the failure this is meant to
/// prevent, and a silent default would hide it.

@ProviderFor(appConfig)
final appConfigProvider = AppConfigProvider._();

/// The configuration.
///
/// Overridden at boot with the values read from `--dart-define`. It throws by default on
/// purpose: an app running with configuration nobody supplied is the failure this is meant to
/// prevent, and a silent default would hide it.

final class AppConfigProvider extends $FunctionalProvider<AppConfig, AppConfig, AppConfig>
    with $Provider<AppConfig> {
  /// The configuration.
  ///
  /// Overridden at boot with the values read from `--dart-define`. It throws by default on
  /// purpose: an app running with configuration nobody supplied is the failure this is meant to
  /// prevent, and a silent default would hide it.
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

String _$appConfigHash() => r'9f060ce11674b13ec9d55de9246cdbcfdb113b1a';
