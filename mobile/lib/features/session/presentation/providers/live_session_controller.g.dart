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

@ProviderFor(LiveSessionController)
final liveSessionControllerProvider = LiveSessionControllerFamily._();

/// The live conversation of one session.
///
/// Keyed by the session, because the session on screen is **navigation state** and lives in the
/// route. Opening another one builds another instance, and the one being left is disposed — which
/// is what makes the detach below fire at the right moment.
final class LiveSessionControllerProvider
    extends $NotifierProvider<LiveSessionController, Conversation> {
  /// The live conversation of one session.
  ///
  /// Keyed by the session, because the session on screen is **navigation state** and lives in the
  /// route. Opening another one builds another instance, and the one being left is disposed — which
  /// is what makes the detach below fire at the right moment.
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
  Override overrideWithValue(Conversation value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<Conversation>(value),
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

String _$liveSessionControllerHash() => r'86e0bc668e38f159dbd6fa549a7ff4340aa61338';

/// The live conversation of one session.
///
/// Keyed by the session, because the session on screen is **navigation state** and lives in the
/// route. Opening another one builds another instance, and the one being left is disposed — which
/// is what makes the detach below fire at the right moment.

final class LiveSessionControllerFamily extends $Family
    with
        $ClassFamilyOverride<
          LiveSessionController,
          Conversation,
          Conversation,
          Conversation,
          String
        > {
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

abstract class _$LiveSessionController extends $Notifier<Conversation> {
  late final _$args = ref.$arg as String;
  String get sessionId => _$args;

  Conversation build(String sessionId);
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<Conversation, Conversation>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<Conversation, Conversation>,
              Conversation,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, () => build(_$args));
  }
}
