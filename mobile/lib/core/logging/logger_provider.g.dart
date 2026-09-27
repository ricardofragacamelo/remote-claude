// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'logger_provider.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The app's logger.
///
/// Built at boot, where the destination and the level are decided, and overridden here. A test
/// overrides it with one whose writer it can read.

@ProviderFor(appLogger)
final appLoggerProvider = AppLoggerProvider._();

/// The app's logger.
///
/// Built at boot, where the destination and the level are decided, and overridden here. A test
/// overrides it with one whose writer it can read.

final class AppLoggerProvider extends $FunctionalProvider<AppLogger, AppLogger, AppLogger>
    with $Provider<AppLogger> {
  /// The app's logger.
  ///
  /// Built at boot, where the destination and the level are decided, and overridden here. A test
  /// overrides it with one whose writer it can read.
  AppLoggerProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'appLoggerProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$appLoggerHash();

  @$internal
  @override
  $ProviderElement<AppLogger> $createElement($ProviderPointer pointer) => $ProviderElement(pointer);

  @override
  AppLogger create(Ref ref) {
    return appLogger(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(AppLogger value) {
    return $ProviderOverride(origin: this, providerOverride: $SyncValueProvider<AppLogger>(value));
  }
}

String _$appLoggerHash() => r'bbb7d3270ed7b1fbf88669f6062bee0012261714';

/// Whether this is a release build: what decides the level the logger falls back to when the
/// diagnostics screen lets go of `debug`. A provider so a test can be either.

@ProviderFor(releaseBuild)
final releaseBuildProvider = ReleaseBuildProvider._();

/// Whether this is a release build: what decides the level the logger falls back to when the
/// diagnostics screen lets go of `debug`. A provider so a test can be either.

final class ReleaseBuildProvider extends $FunctionalProvider<bool, bool, bool>
    with $Provider<bool> {
  /// Whether this is a release build: what decides the level the logger falls back to when the
  /// diagnostics screen lets go of `debug`. A provider so a test can be either.
  ReleaseBuildProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'releaseBuildProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$releaseBuildHash();

  @$internal
  @override
  $ProviderElement<bool> $createElement($ProviderPointer pointer) => $ProviderElement(pointer);

  @override
  bool create(Ref ref) {
    return releaseBuild(ref);
  }

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(bool value) {
    return $ProviderOverride(origin: this, providerOverride: $SyncValueProvider<bool>(value));
  }
}

String _$releaseBuildHash() => r'e1433d84fe92ca5240acaaff254f92c0d1f0beed';
