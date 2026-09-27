// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'conversation_history_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The history of one conversation, keyed by it.

@ProviderFor(ConversationHistoryController)
final conversationHistoryControllerProvider = ConversationHistoryControllerFamily._();

/// The history of one conversation, keyed by it.
final class ConversationHistoryControllerProvider
    extends $AsyncNotifierProvider<ConversationHistoryController, HistoryBoard> {
  /// The history of one conversation, keyed by it.
  ConversationHistoryControllerProvider._({
    required ConversationHistoryControllerFamily super.from,
    required String super.argument,
  }) : super(
         retry: null,
         name: r'conversationHistoryControllerProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$conversationHistoryControllerHash();

  @override
  String toString() {
    return r'conversationHistoryControllerProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  ConversationHistoryController create() => ConversationHistoryController();

  @override
  bool operator ==(Object other) {
    return other is ConversationHistoryControllerProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$conversationHistoryControllerHash() => r'718827f64345e54ff1355f97d1f8536b00fada57';

/// The history of one conversation, keyed by it.

final class ConversationHistoryControllerFamily extends $Family
    with
        $ClassFamilyOverride<
          ConversationHistoryController,
          AsyncValue<HistoryBoard>,
          HistoryBoard,
          FutureOr<HistoryBoard>,
          String
        > {
  ConversationHistoryControllerFamily._()
    : super(
        retry: null,
        name: r'conversationHistoryControllerProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  /// The history of one conversation, keyed by it.

  ConversationHistoryControllerProvider call(String conversationId) =>
      ConversationHistoryControllerProvider._(argument: conversationId, from: this);

  @override
  String toString() => r'conversationHistoryControllerProvider';
}

/// The history of one conversation, keyed by it.

abstract class _$ConversationHistoryController extends $AsyncNotifier<HistoryBoard> {
  late final _$args = ref.$arg as String;
  String get conversationId => _$args;

  FutureOr<HistoryBoard> build(String conversationId);
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<AsyncValue<HistoryBoard>, HistoryBoard>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<AsyncValue<HistoryBoard>, HistoryBoard>,
              AsyncValue<HistoryBoard>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, () => build(_$args));
  }
}
