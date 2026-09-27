// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'debug_logging_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// Whether `debug` is on right now.

@ProviderFor(DebugLogging)
final debugLoggingProvider = DebugLoggingProvider._();

/// Whether `debug` is on right now.
final class DebugLoggingProvider extends $NotifierProvider<DebugLogging, bool> {
  /// Whether `debug` is on right now.
  DebugLoggingProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'debugLoggingProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$debugLoggingHash();

  @$internal
  @override
  DebugLogging create() => DebugLogging();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(bool value) {
    return $ProviderOverride(origin: this, providerOverride: $SyncValueProvider<bool>(value));
  }
}

String _$debugLoggingHash() => r'c3aeffdcbfcc47857e3e61480e60805b14c42b38';

/// Whether `debug` is on right now.

abstract class _$DebugLogging extends $Notifier<bool> {
  bool build();
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<bool, bool>;
    final element =
        ref.element as $ClassProviderElement<AnyNotifier<bool, bool>, bool, Object?, Object?>;
    return element.handleCreate(ref, build);
  }
}
