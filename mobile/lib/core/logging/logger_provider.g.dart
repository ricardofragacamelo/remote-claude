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
