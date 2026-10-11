// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'conversation_history_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The history of one conversation, keyed by it.
///
/// After the first page it **follows** the conversation (`transcript.follow` from the page's
/// `lastMessageId`), and what arrives joins the events. It lets go when nobody shows it, when the app
/// goes to the background and when it is thrown away; it follows again when shown again, when the app
/// comes back and when the socket does — always from the last entry it has, so nothing is missed and
/// nothing comes twice (docs/architecture/mobile/04-ui.md, plan 22 · F4).

@ProviderFor(ConversationHistoryController)
final conversationHistoryControllerProvider = ConversationHistoryControllerFamily._();

/// The history of one conversation, keyed by it.
///
/// After the first page it **follows** the conversation (`transcript.follow` from the page's
/// `lastMessageId`), and what arrives joins the events. It lets go when nobody shows it, when the app
/// goes to the background and when it is thrown away; it follows again when shown again, when the app
/// comes back and when the socket does — always from the last entry it has, so nothing is missed and
/// nothing comes twice (docs/architecture/mobile/04-ui.md, plan 22 · F4).
final class ConversationHistoryControllerProvider
    extends $AsyncNotifierProvider<ConversationHistoryController, HistoryBoard> {
  /// The history of one conversation, keyed by it.
  ///
  /// After the first page it **follows** the conversation (`transcript.follow` from the page's
  /// `lastMessageId`), and what arrives joins the events. It lets go when nobody shows it, when the app
  /// goes to the background and when it is thrown away; it follows again when shown again, when the app
  /// comes back and when the socket does — always from the last entry it has, so nothing is missed and
  /// nothing comes twice (docs/architecture/mobile/04-ui.md, plan 22 · F4).
  ConversationHistoryControllerProvider._({
    required ConversationHistoryControllerFamily super.from,
    required ConversationKey super.argument,
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

String _$conversationHistoryControllerHash() => r'74c5ca4da1d7da60ef55e96c45348e99a783658a';

/// The history of one conversation, keyed by it.
///
/// After the first page it **follows** the conversation (`transcript.follow` from the page's
/// `lastMessageId`), and what arrives joins the events. It lets go when nobody shows it, when the app
/// goes to the background and when it is thrown away; it follows again when shown again, when the app
/// comes back and when the socket does — always from the last entry it has, so nothing is missed and
/// nothing comes twice (docs/architecture/mobile/04-ui.md, plan 22 · F4).

final class ConversationHistoryControllerFamily extends $Family
    with
        $ClassFamilyOverride<
          ConversationHistoryController,
          AsyncValue<HistoryBoard>,
          HistoryBoard,
          FutureOr<HistoryBoard>,
          ConversationKey
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
  ///
  /// After the first page it **follows** the conversation (`transcript.follow` from the page's
  /// `lastMessageId`), and what arrives joins the events. It lets go when nobody shows it, when the app
  /// goes to the background and when it is thrown away; it follows again when shown again, when the app
  /// comes back and when the socket does — always from the last entry it has, so nothing is missed and
  /// nothing comes twice (docs/architecture/mobile/04-ui.md, plan 22 · F4).

  ConversationHistoryControllerProvider call(ConversationKey conversation) =>
      ConversationHistoryControllerProvider._(argument: conversation, from: this);

  @override
  String toString() => r'conversationHistoryControllerProvider';
}

/// The history of one conversation, keyed by it.
///
/// After the first page it **follows** the conversation (`transcript.follow` from the page's
/// `lastMessageId`), and what arrives joins the events. It lets go when nobody shows it, when the app
/// goes to the background and when it is thrown away; it follows again when shown again, when the app
/// comes back and when the socket does — always from the last entry it has, so nothing is missed and
/// nothing comes twice (docs/architecture/mobile/04-ui.md, plan 22 · F4).

abstract class _$ConversationHistoryController extends $AsyncNotifier<HistoryBoard> {
  late final _$args = ref.$arg as ConversationKey;
  ConversationKey get conversation => _$args;

  FutureOr<HistoryBoard> build(ConversationKey conversation);
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
