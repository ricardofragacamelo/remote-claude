// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'fork_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The forks of one session's screen, keyed by that session. Where one stands is what a resume's
/// state says — pending, not sent, refused, or the session it opened.

@ProviderFor(ForkController)
final forkControllerProvider = ForkControllerFamily._();

/// The forks of one session's screen, keyed by that session. Where one stands is what a resume's
/// state says — pending, not sent, refused, or the session it opened.
final class ForkControllerProvider extends $NotifierProvider<ForkController, ResumeState> {
  /// The forks of one session's screen, keyed by that session. Where one stands is what a resume's
  /// state says — pending, not sent, refused, or the session it opened.
  ForkControllerProvider._({
    required ForkControllerFamily super.from,
    required String super.argument,
  }) : super(
         retry: null,
         name: r'forkControllerProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$forkControllerHash();

  @override
  String toString() {
    return r'forkControllerProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  ForkController create() => ForkController();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(ResumeState value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<ResumeState>(value),
    );
  }

  @override
  bool operator ==(Object other) {
    return other is ForkControllerProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$forkControllerHash() => r'0dc6d09fd308b00fa529b6eabee82f5cfa7a7d19';

/// The forks of one session's screen, keyed by that session. Where one stands is what a resume's
/// state says — pending, not sent, refused, or the session it opened.

final class ForkControllerFamily extends $Family
    with $ClassFamilyOverride<ForkController, ResumeState, ResumeState, ResumeState, String> {
  ForkControllerFamily._()
    : super(
        retry: null,
        name: r'forkControllerProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  /// The forks of one session's screen, keyed by that session. Where one stands is what a resume's
  /// state says — pending, not sent, refused, or the session it opened.

  ForkControllerProvider call(String sessionId) =>
      ForkControllerProvider._(argument: sessionId, from: this);

  @override
  String toString() => r'forkControllerProvider';
}

/// The forks of one session's screen, keyed by that session. Where one stands is what a resume's
/// state says — pending, not sent, refused, or the session it opened.

abstract class _$ForkController extends $Notifier<ResumeState> {
  late final _$args = ref.$arg as String;
  String get sessionId => _$args;

  ResumeState build(String sessionId);
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<ResumeState, ResumeState>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<ResumeState, ResumeState>,
              ResumeState,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, () => build(_$args));
  }
}
