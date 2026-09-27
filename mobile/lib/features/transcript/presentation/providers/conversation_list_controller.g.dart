// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'conversation_list_controller.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The conversations of one workspace, keyed by it (S-12: the list is that workspace's, and only
/// that workspace's).
///
/// An `AsyncNotifier` because the screen has a retry and a "load more", and both are asking again
/// from here (docs/architecture/mobile/04-ui.md).

@ProviderFor(ConversationListController)
final conversationListControllerProvider = ConversationListControllerFamily._();

/// The conversations of one workspace, keyed by it (S-12: the list is that workspace's, and only
/// that workspace's).
///
/// An `AsyncNotifier` because the screen has a retry and a "load more", and both are asking again
/// from here (docs/architecture/mobile/04-ui.md).
final class ConversationListControllerProvider
    extends $AsyncNotifierProvider<ConversationListController, ConversationBoard> {
  /// The conversations of one workspace, keyed by it (S-12: the list is that workspace's, and only
  /// that workspace's).
  ///
  /// An `AsyncNotifier` because the screen has a retry and a "load more", and both are asking again
  /// from here (docs/architecture/mobile/04-ui.md).
  ConversationListControllerProvider._({
    required ConversationListControllerFamily super.from,
    required String super.argument,
  }) : super(
         retry: null,
         name: r'conversationListControllerProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$conversationListControllerHash();

  @override
  String toString() {
    return r'conversationListControllerProvider'
        ''
        '($argument)';
  }

  @$internal
  @override
  ConversationListController create() => ConversationListController();

  @override
  bool operator ==(Object other) {
    return other is ConversationListControllerProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$conversationListControllerHash() => r'40250d39e6eb1c18b3a6629ea9f1c5430919935f';

/// The conversations of one workspace, keyed by it (S-12: the list is that workspace's, and only
/// that workspace's).
///
/// An `AsyncNotifier` because the screen has a retry and a "load more", and both are asking again
/// from here (docs/architecture/mobile/04-ui.md).

final class ConversationListControllerFamily extends $Family
    with
        $ClassFamilyOverride<
          ConversationListController,
          AsyncValue<ConversationBoard>,
          ConversationBoard,
          FutureOr<ConversationBoard>,
          String
        > {
  ConversationListControllerFamily._()
    : super(
        retry: null,
        name: r'conversationListControllerProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  /// The conversations of one workspace, keyed by it (S-12: the list is that workspace's, and only
  /// that workspace's).
  ///
  /// An `AsyncNotifier` because the screen has a retry and a "load more", and both are asking again
  /// from here (docs/architecture/mobile/04-ui.md).

  ConversationListControllerProvider call(String workspacePath) =>
      ConversationListControllerProvider._(argument: workspacePath, from: this);

  @override
  String toString() => r'conversationListControllerProvider';
}

/// The conversations of one workspace, keyed by it (S-12: the list is that workspace's, and only
/// that workspace's).
///
/// An `AsyncNotifier` because the screen has a retry and a "load more", and both are asking again
/// from here (docs/architecture/mobile/04-ui.md).

abstract class _$ConversationListController extends $AsyncNotifier<ConversationBoard> {
  late final _$args = ref.$arg as String;
  String get workspacePath => _$args;

  FutureOr<ConversationBoard> build(String workspacePath);
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<AsyncValue<ConversationBoard>, ConversationBoard>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<AsyncValue<ConversationBoard>, ConversationBoard>,
              AsyncValue<ConversationBoard>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, () => build(_$args));
  }
}
