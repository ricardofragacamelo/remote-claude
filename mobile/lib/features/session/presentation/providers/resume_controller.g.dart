// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'resume_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The resume of one conversation, keyed by it — by its engine and its id, never the id alone.

@ProviderFor(ResumeController)
final resumeControllerProvider = ResumeControllerFamily._();

/// The resume of one conversation, keyed by it — by its engine and its id, never the id alone.
final class ResumeControllerProvider extends $NotifierProvider<ResumeController, ResumeState> {
  /// The resume of one conversation, keyed by it — by its engine and its id, never the id alone.
  ResumeControllerProvider._({
    required ResumeControllerFamily super.from,
    required ConversationKey super.argument,
  }) : super(
         retry: null,
         name: r'resumeControllerProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$resumeControllerHash();

  @override
  String toString() {
    return r'resumeControllerProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  ResumeController create() => ResumeController();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(ResumeState value) {
    return $ProviderOverride(
      origin: this,
      providerOverride: $SyncValueProvider<ResumeState>(value),
    );
  }

  @override
  bool operator ==(Object other) {
    return other is ResumeControllerProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$resumeControllerHash() => r'59fb44fe4f43e3ce4c9ea85e874fb3cca0e69da4';

/// The resume of one conversation, keyed by it — by its engine and its id, never the id alone.

final class ResumeControllerFamily extends $Family
    with
        $ClassFamilyOverride<
          ResumeController,
          ResumeState,
          ResumeState,
          ResumeState,
          ConversationKey
        > {
  ResumeControllerFamily._()
    : super(
        retry: null,
        name: r'resumeControllerProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  /// The resume of one conversation, keyed by it — by its engine and its id, never the id alone.

  ResumeControllerProvider call(ConversationKey conversation) =>
      ResumeControllerProvider._(argument: conversation, from: this);

  @override
  String toString() => r'resumeControllerProvider';
}

/// The resume of one conversation, keyed by it — by its engine and its id, never the id alone.

abstract class _$ResumeController extends $Notifier<ResumeState> {
  late final _$args = ref.$arg as ConversationKey;
  ConversationKey get conversation => _$args;

  ResumeState build(ConversationKey conversation);
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
