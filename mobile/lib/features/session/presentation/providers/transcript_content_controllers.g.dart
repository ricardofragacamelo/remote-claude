// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'transcript_content_controllers.dart';

// **************************************************************************
// RiverpodGenerator
// **************************************************************************

// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, type=warning
/// The whole output of one tool of the main conversation, read **once** when its card is first
/// opened: the card keeps watching it while it is on screen, so folding and unfolding asks nothing
/// (S-113), and it outlives the card for [toolOutputKeptFor].

@ProviderFor(ToolResultController)
final toolResultControllerProvider = ToolResultControllerFamily._();

/// The whole output of one tool of the main conversation, read **once** when its card is first
/// opened: the card keeps watching it while it is on screen, so folding and unfolding asks nothing
/// (S-113), and it outlives the card for [toolOutputKeptFor].
final class ToolResultControllerProvider
    extends $AsyncNotifierProvider<ToolResultController, ToolOutput> {
  /// The whole output of one tool of the main conversation, read **once** when its card is first
  /// opened: the card keeps watching it while it is on screen, so folding and unfolding asks nothing
  /// (S-113), and it outlives the card for [toolOutputKeptFor].
  ToolResultControllerProvider._({
    required ToolResultControllerFamily super.from,
    required (ConversationKey, String) super.argument,
  }) : super(
         retry: _neverRetry,
         name: r'toolResultControllerProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$toolResultControllerHash();

  @override
  String toString() {
    return r'toolResultControllerProvider'
        ''
        '$argument';
  }

  @$internal
  @override
  ToolResultController create() => ToolResultController();

  @override
  bool operator ==(Object other) {
    return other is ToolResultControllerProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$toolResultControllerHash() => r'245456e307ee5bd8a9134040967f7c92549f9570';

/// The whole output of one tool of the main conversation, read **once** when its card is first
/// opened: the card keeps watching it while it is on screen, so folding and unfolding asks nothing
/// (S-113), and it outlives the card for [toolOutputKeptFor].

final class ToolResultControllerFamily extends $Family
    with
        $ClassFamilyOverride<
          ToolResultController,
          AsyncValue<ToolOutput>,
          ToolOutput,
          FutureOr<ToolOutput>,
          (ConversationKey, String)
        > {
  ToolResultControllerFamily._()
    : super(
        retry: _neverRetry,
        name: r'toolResultControllerProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  /// The whole output of one tool of the main conversation, read **once** when its card is first
  /// opened: the card keeps watching it while it is on screen, so folding and unfolding asks nothing
  /// (S-113), and it outlives the card for [toolOutputKeptFor].

  ToolResultControllerProvider call(ConversationKey conversation, String toolUseId) =>
      ToolResultControllerProvider._(argument: (conversation, toolUseId), from: this);

  @override
  String toString() => r'toolResultControllerProvider';
}

/// The whole output of one tool of the main conversation, read **once** when its card is first
/// opened: the card keeps watching it while it is on screen, so folding and unfolding asks nothing
/// (S-113), and it outlives the card for [toolOutputKeptFor].

abstract class _$ToolResultController extends $AsyncNotifier<ToolOutput> {
  late final _$args = ref.$arg as (ConversationKey, String);
  ConversationKey get conversation => _$args.$1;
  String get toolUseId => _$args.$2;

  FutureOr<ToolOutput> build(ConversationKey conversation, String toolUseId);
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<AsyncValue<ToolOutput>, ToolOutput>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<AsyncValue<ToolOutput>, ToolOutput>,
              AsyncValue<ToolOutput>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, () => build(_$args.$1, _$args.$2));
  }
}

/// The image of one prompt, read when the person opens it — with the credential in the header,
/// never in a URL (D-10, S-122) — and let go when the screen that shows it closes, so the bytes do
/// not outlive it (S-119).

@ProviderFor(PromptImageController)
final promptImageControllerProvider = PromptImageControllerFamily._();

/// The image of one prompt, read when the person opens it — with the credential in the header,
/// never in a URL (D-10, S-122) — and let go when the screen that shows it closes, so the bytes do
/// not outlive it (S-119).
final class PromptImageControllerProvider
    extends $AsyncNotifierProvider<PromptImageController, PromptImageBytes> {
  /// The image of one prompt, read when the person opens it — with the credential in the header,
  /// never in a URL (D-10, S-122) — and let go when the screen that shows it closes, so the bytes do
  /// not outlive it (S-119).
  PromptImageControllerProvider._({
    required PromptImageControllerFamily super.from,
    required (ConversationKey, String) super.argument,
  }) : super(
         retry: _neverRetry,
         name: r'promptImageControllerProvider',
         isAutoDispose: true,
         dependencies: null,
         $allTransitiveDependencies: null,
       );

  @override
  String debugGetCreateSourceHash() => _$promptImageControllerHash();

  @override
  String toString() {
    return r'promptImageControllerProvider'
        ''
        '$argument';
  }

  @$internal
  @override
  PromptImageController create() => PromptImageController();

  @override
  bool operator ==(Object other) {
    return other is PromptImageControllerProvider && other.argument == argument;
  }

  @override
  int get hashCode {
    return argument.hashCode;
  }
}

String _$promptImageControllerHash() => r'3e1002a099ac1805e64111e93aab0a4d92e4125b';

/// The image of one prompt, read when the person opens it — with the credential in the header,
/// never in a URL (D-10, S-122) — and let go when the screen that shows it closes, so the bytes do
/// not outlive it (S-119).

final class PromptImageControllerFamily extends $Family
    with
        $ClassFamilyOverride<
          PromptImageController,
          AsyncValue<PromptImageBytes>,
          PromptImageBytes,
          FutureOr<PromptImageBytes>,
          (ConversationKey, String)
        > {
  PromptImageControllerFamily._()
    : super(
        retry: _neverRetry,
        name: r'promptImageControllerProvider',
        dependencies: null,
        $allTransitiveDependencies: null,
        isAutoDispose: true,
      );

  /// The image of one prompt, read when the person opens it — with the credential in the header,
  /// never in a URL (D-10, S-122) — and let go when the screen that shows it closes, so the bytes do
  /// not outlive it (S-119).

  PromptImageControllerProvider call(ConversationKey conversation, String blockId) =>
      PromptImageControllerProvider._(argument: (conversation, blockId), from: this);

  @override
  String toString() => r'promptImageControllerProvider';
}

/// The image of one prompt, read when the person opens it — with the credential in the header,
/// never in a URL (D-10, S-122) — and let go when the screen that shows it closes, so the bytes do
/// not outlive it (S-119).

abstract class _$PromptImageController extends $AsyncNotifier<PromptImageBytes> {
  late final _$args = ref.$arg as (ConversationKey, String);
  ConversationKey get conversation => _$args.$1;
  String get blockId => _$args.$2;

  FutureOr<PromptImageBytes> build(ConversationKey conversation, String blockId);
  @$mustCallSuper
  @override
  WhenComplete runBuild() {
    final ref = this.ref as $Ref<AsyncValue<PromptImageBytes>, PromptImageBytes>;
    final element =
        ref.element
            as $ClassProviderElement<
              AnyNotifier<AsyncValue<PromptImageBytes>, PromptImageBytes>,
              AsyncValue<PromptImageBytes>,
              Object?,
              Object?
            >;
    return element.handleCreate(ref, () => build(_$args.$1, _$args.$2));
  }
}
