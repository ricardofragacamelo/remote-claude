/// The conversations of one workspace, as the history screen has them.
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/transcript/domain/entities/conversation_summary.dart';
import 'package:remote_claude/features/transcript/transcript_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'conversation_list_controller.g.dart';

/// The pages read so far, and whatever reading the next one is doing.
class ConversationBoard extends Equatable {
  const ConversationBoard({
    this.conversations = const <ConversationSummary>[],
    this.nextCursor,
    this.isLoadingMore = false,
    this.moreFailure,
  });

  /// The first page, as a board.
  factory ConversationBoard.from(ConversationList page) =>
      ConversationBoard(conversations: page.conversations, nextCursor: page.nextCursor);

  /// Newest first, every page read so far.
  final List<ConversationSummary> conversations;

  /// Where the next page starts, or `null` when there is none.
  final String? nextCursor;

  /// The next page is being read. A second tap asks for nothing.
  final bool isLoadingMore;

  /// Why reading the next page failed. What is on screen stays, with the reason beside the
  /// button — replacing the list with an error would hide everything already read.
  final Failure? moreFailure;

  @override
  List<Object?> get props => <Object?>[conversations, nextCursor, isLoadingMore, moreFailure];
}

/// The conversations of one workspace, keyed by it (S-12: the list is that workspace's, and only
/// that workspace's).
///
/// An `AsyncNotifier` because the screen has a retry and a "load more", and both are asking again
/// from here (docs/architecture/mobile/04-ui.md).
@riverpod
class ConversationListController extends _$ConversationListController {
  @override
  Future<ConversationBoard> build(String workspacePath) async =>
      ConversationBoard.from(await ref.watch(listConversationsProvider)(workspacePath));

  /// Reads the first page again — the recovery the error state offers.
  Future<void> reload() async {
    state = const AsyncValue<ConversationBoard>.loading();
    state = await AsyncValue.guard<ConversationBoard>(
      () async => ConversationBoard.from(await ref.read(listConversationsProvider)(workspacePath)),
    );
  }

  /// Reads the next page and puts it after what is on screen.
  Future<void> loadMore() async {
    final ConversationBoard? board = state.value;
    final String? cursor = board?.nextCursor;

    if (board == null || cursor == null || board.isLoadingMore) {
      return;
    }

    state = AsyncValue<ConversationBoard>.data(
      ConversationBoard(
        conversations: board.conversations,
        nextCursor: cursor,
        isLoadingMore: true,
      ),
    );

    try {
      final ConversationList page = await ref.read(listConversationsProvider)(
        workspacePath,
        cursor: cursor,
      );

      _settle(
        (ConversationBoard now) => ConversationBoard(
          conversations: <ConversationSummary>[...now.conversations, ...page.conversations],
          nextCursor: page.nextCursor,
        ),
      );
    } on Object catch (error) {
      _settle(
        (ConversationBoard now) => ConversationBoard(
          conversations: now.conversations,
          nextCursor: now.nextCursor,
          moreFailure: asFailure(error),
        ),
      );
    }
  }

  /// Applies what the next page answered to what is on screen **now** — nothing, when the list
  /// was read again meanwhile and is no longer waiting for that page.
  void _settle(ConversationBoard Function(ConversationBoard now) outcome) {
    final ConversationBoard? now = ref.mounted ? state.value : null;

    if (now != null && now.isLoadingMore) {
      state = AsyncValue<ConversationBoard>.data(outcome(now));
    }
  }
}
