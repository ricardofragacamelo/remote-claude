// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'owned_sessions.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The ids of the sessions opened here, for as long as the app runs.

@ProviderFor(OwnedSessions)
final ownedSessionsProvider = OwnedSessionsProvider._();

/// The ids of the sessions opened here, for as long as the app runs.
final class OwnedSessionsProvider extends $NotifierProvider<OwnedSessions, Set<String>> {
  /// The ids of the sessions opened here, for as long as the app runs.
  OwnedSessionsProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'ownedSessionsProvider',
        isAutoDispose: false,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$ownedSessionsHash();

  @$internal
  @override
  OwnedSessions create() => OwnedSessions();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(Set<String> value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<Set<String>>(value),
    );
  }
}

String _$ownedSessionsHash() => r'372fbc0254e4d46800aec3f5e422480eccf967a6';

/// The ids of the sessions opened here, for as long as the app runs.

abstract class _$OwnedSessions extends $Notifier<Set<String>> {
  Set<String> build();
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<Set<String>, Set<String>>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<Set<String>, Set<String>>,
              Set<String>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, build);
  }
}
