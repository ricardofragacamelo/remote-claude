// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'subagent_history_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The messages of [toolUseId]'s own subagent, in [conversation].

@ProviderFor(SubagentHistoryController)
final subagentHistoryControllerProvider = SubagentHistoryControllerFamily._();

/// The messages of [toolUseId]'s own subagent, in [conversation].
final class SubagentHistoryControllerProvider
    extends $AsyncNotifierProvider<SubagentHistoryController, SubagentPage> {
  /// The messages of [toolUseId]'s own subagent, in [conversation].
  SubagentHistoryControllerProvider._({
    required SubagentHistoryControllerFamily super.from,
    required (ConversationKey, String) super.argument,
  }) : super(
         retry: _neverRetry,
         name: r'subagentHistoryControllerProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$subagentHistoryControllerHash();

  @override
  String toString() {
    return r'subagentHistoryControllerProvider'
        ''
        '$argument';
  }

  @$internal
  @override
  SubagentHistoryController create() => SubagentHistoryController();

  @override
  bool operator ==(Object other) {
    return other is SubagentHistoryControllerProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$subagentHistoryControllerHash() => r'bb7fa1988a897aaef49e84c305d94481dc95342b';

/// The messages of [toolUseId]'s own subagent, in [conversation].

final class SubagentHistoryControllerFamily extends $Family
    with
        $ClassFamilyOverride<
          SubagentHistoryController,
          AsyncValue<SubagentPage>,
          SubagentPage,
          FutureOr<SubagentPage>,
          (ConversationKey, String)
        > {
  SubagentHistoryControllerFamily._()
    : super(
        retry: _neverRetry,
        name: r'subagentHistoryControllerProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  /// The messages of [toolUseId]'s own subagent, in [conversation].

  SubagentHistoryControllerProvider call(ConversationKey conversation, String toolUseId) =>
      SubagentHistoryControllerProvider._(argument: (conversation, toolUseId), from: this);

  @override
  String toString() => r'subagentHistoryControllerProvider';
}

/// The messages of [toolUseId]'s own subagent, in [conversation].

abstract class _$SubagentHistoryController extends $AsyncNotifier<SubagentPage> {
  late final _$args = ref.$arg as (ConversationKey, String);
  ConversationKey get conversation => _$args.$1;
  String get toolUseId => _$args.$2;

  FutureOr<SubagentPage> build(ConversationKey conversation, String toolUseId);
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<AsyncValue<SubagentPage>, SubagentPage>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<AsyncValue<SubagentPage>, SubagentPage>,
              AsyncValue<SubagentPage>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, () => build(_$args.$1, _$args.$2));
  }
}
