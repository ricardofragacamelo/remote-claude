// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'session_stream_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The live stream of the session on screen.

@ProviderFor(SessionStreamController)
final sessionStreamControllerProvider = SessionStreamControllerProvider._();

/// The live stream of the session on screen.
final class SessionStreamControllerProvider
    extends $NotifierProvider<SessionStreamController, SessionScreenState> {
  /// The live stream of the session on screen.
  SessionStreamControllerProvider._()
    : super(
        from: null,
        argument: null,
        retry: null,
        name: r'sessionStreamControllerProvider',
        isAutoDispose: true,
        dependencies: null,
        $allTransitiveDependencies: null,
      );

  @override
  String debugGetCreateSourceHash() => _$sessionStreamControllerHash();

  @$internal
  @override
  SessionStreamController create() => SessionStreamController();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(SessionScreenState value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<SessionScreenState>(value),
    );
  }
}

String _$sessionStreamControllerHash() => r'86e900148a543b7dc82c034f62b27e98d37b766e';

/// The live stream of the session on screen.

abstract class _$SessionStreamController extends $Notifier<SessionScreenState> {
  SessionScreenState build();
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<SessionScreenState, SessionScreenState>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<SessionScreenState, SessionScreenState>,
              SessionScreenState,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, build);
  }
}
