// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'draft_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The draft of one folder. Disposed with its screen: leaving a draft leaves nothing (S-22).

@ProviderFor(DraftController)
final draftControllerProvider = DraftControllerFamily._();

/// The draft of one folder. Disposed with its screen: leaving a draft leaves nothing (S-22).
final class DraftControllerProvider extends $NotifierProvider<DraftController, Draft> {
  /// The draft of one folder. Disposed with its screen: leaving a draft leaves nothing (S-22).
  DraftControllerProvider._({
    required DraftControllerFamily super.from,
    required String super.argument,
  }) : super(
         retry: null,
         name: r'draftControllerProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$draftControllerHash();

  @override
  String toString() {
    return r'draftControllerProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  DraftController create() => DraftController();

  /// {@macro riverpod.override_with_value}
  Override overrideWithValue(Draft value) {
    return $ProviderOverride(origin: this, providerOverride: $SyncValueProvider<Draft>(value));
  }

  @override
  bool operator ==(Object other) {
    return other is DraftControllerProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$draftControllerHash() => r'07dc7d71bed73e3d33b1cc2f56e867656b2ab8a0';

/// The draft of one folder. Disposed with its screen: leaving a draft leaves nothing (S-22).

final class DraftControllerFamily extends $Family
    with $ClassFamilyOverride<DraftController, Draft, Draft, Draft, String> {
  DraftControllerFamily._()
    : super(
        retry: null,
        name: r'draftControllerProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  /// The draft of one folder. Disposed with its screen: leaving a draft leaves nothing (S-22).

  DraftControllerProvider call(String workspacePath) =>
      DraftControllerProvider._(argument: workspacePath, from: this);

  @override
  String toString() => r'draftControllerProvider';
}

/// The draft of one folder. Disposed with its screen: leaving a draft leaves nothing (S-22).

abstract class _$DraftController extends $Notifier<Draft> {
  late final _$args = ref.$arg as String;
  String get workspacePath => _$args;

  Draft build(String workspacePath);
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<Draft, Draft>;
    final element =
        ref.element as $ClassProviderElement<AnyNotifier<Draft, Draft>, Draft, Object?, Object?>;
    return element.handleCreate(ref, () => build(_$args));
  }
}
