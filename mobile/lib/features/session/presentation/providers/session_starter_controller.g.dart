// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'session_starter_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The session this app opened most recently, or `null` before it opened one.

@ProviderFor(SessionStarterController)
final sessionStarterControllerProvider = SessionStarterControllerProvider._();

/// The session this app opened most recently, or `null` before it opened one.
final class SessionStarterControllerProvider
    extends $NotifierProvider<SessionStarterController, String?> {
  /// The session this app opened most recently, or `null` before it opened one.
  SessionStarterControllerProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'sessionStarterControllerProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$sessionStarterControllerHash();

  @$internal
  @override
  SessionStarterController create() => SessionStarterController();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(String? value) {
    return $ProviderOverride(origin: this, providerOverride: $SyncValueProvider<String?>(value));
  }
}

String _$sessionStarterControllerHash() => r'a754e414c8e5d2c2d8f5205dd9a8cea1017ab568';

/// The session this app opened most recently, or `null` before it opened one.

abstract class _$SessionStarterController extends $Notifier<String?> {
  String? build();
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<String?, String?>;
    final element =
        ref.element
            as $ClassProviderElement<AnyNotifier<String?, String?>, String?, Object?, Object?>;
    return element.handleCreate(ref, build);
  }
}
