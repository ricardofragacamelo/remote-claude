// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'live_session_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The live conversation of one session.
///
/// Keyed by the session, because the session on screen is **navigation state** and lives in the
/// route. Opening another one builds another instance, and the one being left is disposed — which
/// is what makes the detach below fire at the right moment.
///
/// Two sources make up what it shows, and they are kept apart until the last moment: the live
/// stream, which has a `seq`, and the history read over HTTP, which has none. Folding them into
/// one another would let the history move the resume point, or the replay duplicate the history;
/// laying one over the other at render time is what keeps both from happening (S-15, S-21).

@ProviderFor(LiveSessionController)
final liveSessionControllerProvider = LiveSessionControllerFamily._();

/// The live conversation of one session.
///
/// Keyed by the session, because the session on screen is **navigation state** and lives in the
/// route. Opening another one builds another instance, and the one being left is disposed — which
/// is what makes the detach below fire at the right moment.
///
/// Two sources make up what it shows, and they are kept apart until the last moment: the live
/// stream, which has a `seq`, and the history read over HTTP, which has none. Folding them into
/// one another would let the history move the resume point, or the replay duplicate the history;
/// laying one over the other at render time is what keeps both from happening (S-15, S-21).
final class LiveSessionControllerProvider
    extends $NotifierProvider<LiveSessionController, LiveSession> {
  /// The live conversation of one session.
  ///
  /// Keyed by the session, because the session on screen is **navigation state** and lives in the
  /// route. Opening another one builds another instance, and the one being left is disposed — which
  /// is what makes the detach below fire at the right moment.
  ///
  /// Two sources make up what it shows, and they are kept apart until the last moment: the live
  /// stream, which has a `seq`, and the history read over HTTP, which has none. Folding them into
  /// one another would let the history move the resume point, or the replay duplicate the history;
  /// laying one over the other at render time is what keeps both from happening (S-15, S-21).
  LiveSessionControllerProvider._({
    required LiveSessionControllerFamily super.from,
    required String super.argument,
  }) : super(
         retry: null,
         name: r'liveSessionControllerProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$liveSessionControllerHash();

  @override
  String toString() {
    return r'liveSessionControllerProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  LiveSessionController create() => LiveSessionController();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(LiveSession value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<LiveSession>(value),
    );
  }

  @override
  bool operator ==(Object other) {
    return other is LiveSessionControllerProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$liveSessionControllerHash() => r'927f72750c510a1841d89a1a262ff519e6e99e33';

/// The live conversation of one session.
///
/// Keyed by the session, because the session on screen is **navigation state** and lives in the
/// route. Opening another one builds another instance, and the one being left is disposed — which
/// is what makes the detach below fire at the right moment.
///
/// Two sources make up what it shows, and they are kept apart until the last moment: the live
/// stream, which has a `seq`, and the history read over HTTP, which has none. Folding them into
/// one another would let the history move the resume point, or the replay duplicate the history;
/// laying one over the other at render time is what keeps both from happening (S-15, S-21).

final class LiveSessionControllerFamily extends $Family
    with
        $ClassFamilyOverride<LiveSessionController, LiveSession, LiveSession, LiveSession, String> {
  LiveSessionControllerFamily._()
    : super(
        retry: null,
        name: r'liveSessionControllerProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  /// The live conversation of one session.
  ///
  /// Keyed by the session, because the session on screen is **navigation state** and lives in the
  /// route. Opening another one builds another instance, and the one being left is disposed — which
  /// is what makes the detach below fire at the right moment.
  ///
  /// Two sources make up what it shows, and they are kept apart until the last moment: the live
  /// stream, which has a `seq`, and the history read over HTTP, which has none. Folding them into
  /// one another would let the history move the resume point, or the replay duplicate the history;
  /// laying one over the other at render time is what keeps both from happening (S-15, S-21).

  LiveSessionControllerProvider call(String sessionId) =>
      LiveSessionControllerProvider._(argument: sessionId, from: this);

  @override
  String toString() => r'liveSessionControllerProvider';
}

/// The live conversation of one session.
///
/// Keyed by the session, because the session on screen is **navigation state** and lives in the
/// route. Opening another one builds another instance, and the one being left is disposed — which
/// is what makes the detach below fire at the right moment.
///
/// Two sources make up what it shows, and they are kept apart until the last moment: the live
/// stream, which has a `seq`, and the history read over HTTP, which has none. Folding them into
/// one another would let the history move the resume point, or the replay duplicate the history;
/// laying one over the other at render time is what keeps both from happening (S-15, S-21).

abstract class _$LiveSessionController extends $Notifier<LiveSession> {
  late final _$args = ref.$arg as String;
  String get sessionId => _$args;

  LiveSession build(String sessionId);
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<LiveSession, LiveSession>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<LiveSession, LiveSession>,
              LiveSession,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, () => build(_$args));
  }
}
