/// One conversation of the history, as the read-only screen has it.
library;

import 'dart:async';

import 'package:equatable/equatable.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/history_page.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'conversation_history_controller.g.dart';

/// How long a conversation read stays in memory after the last screen showing it went away.
///
/// Long enough that opening it again — back, then in again — reads nothing twice (S-16); short
/// enough that a conversation read an hour ago is read again rather than shown as it was.
const Duration historyKeptFor = Duration(seconds: 30);

/// The pages read so far, and whatever reading an earlier one is doing.
class HistoryBoard extends Equatable {
  const HistoryBoard({
    required this.latest,
    required this.events,
    this.nextCursor,
    this.isLoadingEarlier = false,
    this.earlierFailure,
  });

  /// The first page read, as a board.
  HistoryBoard.from(HistoryPage page)
    : this(latest: page, events: page.events, nextCursor: page.nextCursor);

  /// The latest page — which is also what says what the conversation is: where it ran, where it
  /// began, what it is called.
  final HistoryPage latest;

  /// Every event read, oldest first — earlier pages are put in front.
  final List<SessionEvent> events;

  /// The page before the oldest one read, or `null` when that was the first message.
  final String? nextCursor;

  /// An earlier page is being read. A second tap asks for nothing.
  final bool isLoadingEarlier;

  /// Why reading an earlier page failed. What is on screen stays, with the reason beside it.
  final Failure? earlierFailure;

  /// Where the conversation ran, and so where a resume of it runs.
  String get workspacePath => latest.workspacePath;

  /// Whether it began outside this product, which is what the note before a resume is about.
  bool get beganElsewhere => latest.beganElsewhere;

  String get summary => latest.summary;

  /// Whether there is anything to show at all.
  bool get isEmpty => events.isEmpty && nextCursor == null;

  /// The events as a conversation, through the same fold the live stream uses.
  Conversation get conversation => const Conversation().withHistory(events);

  @override
  List<Object?> get props => <Object?>[
    latest,
    events,
    nextCursor,
    isLoadingEarlier,
    earlierFailure,
  ];
}

/// The history of one conversation, keyed by it.
@riverpod
class ConversationHistoryController extends _$ConversationHistoryController {
  @override
  Future<HistoryBoard> build(String conversationId) async {
    _keepForAWhile();
    return HistoryBoard.from(await ref.watch(readHistoryProvider)(conversationId));
  }

  /// Reads the latest page again — the recovery the error state offers.
  Future<void> reload() async {
    state = const AsyncValue<HistoryBoard>.loading();
    state = await AsyncValue.guard<HistoryBoard>(
      () async => HistoryBoard.from(await ref.read(readHistoryProvider)(conversationId)),
    );
  }

  /// Reads the page before the oldest one on screen, and puts it in front.
  Future<void> loadEarlier() async {
    final HistoryBoard? board = state.value;
    final String? cursor = board?.nextCursor;

    if (board == null || cursor == null || board.isLoadingEarlier) {
      return;
    }

    state = AsyncValue<HistoryBoard>.data(
      HistoryBoard(
        latest: board.latest,
        events: board.events,
        nextCursor: cursor,
        isLoadingEarlier: true,
      ),
    );

    try {
      final HistoryPage page = await ref.read(readHistoryProvider)(conversationId, cursor: cursor);

      _settle(
        (HistoryBoard now) => HistoryBoard(
          latest: now.latest,
          events: <SessionEvent>[...page.events, ...now.events],
          nextCursor: page.nextCursor,
        ),
      );
    } on Object catch (error) {
      _settle(
        (HistoryBoard now) => HistoryBoard(
          latest: now.latest,
          events: now.events,
          nextCursor: now.nextCursor,
          earlierFailure: asFailure(error),
        ),
      );
    }
  }

  /// Applies what an earlier page answered to whatever is on screen **now** — nothing, when the
  /// screen was read again meanwhile: a board read afresh is not waiting for any earlier page, and
  /// putting one in front of it would stitch two readings together.
  void _settle(HistoryBoard Function(HistoryBoard now) outcome) {
    final HistoryBoard? now = ref.mounted ? state.value : null;

    if (now != null && now.isLoadingEarlier) {
      state = AsyncValue<HistoryBoard>.data(outcome(now));
    }
  }

  /// Keeps what was read for [historyKeptFor] after the last listener leaves (S-16).
  void _keepForAWhile() {
    final KeepAliveLink link = ref.keepAlive();
    Timer? release;

    ref.onCancel(() => release = Timer(historyKeptFor, link.close));
    ref.onResume(() => release?.cancel());
    ref.onDispose(() => release?.cancel());
  }
}
