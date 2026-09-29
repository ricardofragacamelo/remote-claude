// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'session_starter_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The last start from this app: the session it opened, or the reason it was refused.

@ProviderFor(SessionStarterController)
final sessionStarterControllerProvider = SessionStarterControllerProvider._();

/// The last start from this app: the session it opened, or the reason it was refused.
final class SessionStarterControllerProvider
    extends $NotifierProvider<SessionStarterController, SessionStart> {
  /// The last start from this app: the session it opened, or the reason it was refused.
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
  Override overrideWithValue(SessionStart value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<SessionStart>(value),
    );
  }
}

String _$sessionStarterControllerHash() => r'a9ee34711db96d8919c4fc8d36ca97a2fd251f69';

/// The last start from this app: the session it opened, or the reason it was refused.

abstract class _$SessionStarterController extends $Notifier<SessionStart> {
  SessionStart build();
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<SessionStart, SessionStart>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<SessionStart, SessionStart>,
              SessionStart,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, build);
  }
}
