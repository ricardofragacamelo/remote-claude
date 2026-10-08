/// One conversation of the history, as the read-only screen has it — and, while it is on screen,
/// followed as another client writes it (plan 22, B-25).
library;

import 'dart:async';

import 'package:equatable/equatable.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/history_page.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';
import 'package:remote_claude/features/session/domain/entities/transcript_follow.dart';
import 'package:remote_claude/features/session/domain/usecases/follow_transcript.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'conversation_history_controller.g.dart';

/// How long a conversation read stays in memory after the last screen showing it went away.
///
/// Long enough that opening it again — back, then in again — reads nothing twice (S-16); short
/// enough that a conversation read an hour ago is read again rather than shown as it was.
const Duration historyKeptFor = Duration(seconds: 30);

/// What [HistoryBoard.copyWith] leaves as it was.
const Object _same = Object();

/// The pages read so far, what the conversation is doing now, and whatever reading an earlier page
/// is doing.
class HistoryBoard extends Equatable {
  const HistoryBoard({
    required this.latest,
    required this.events,
    this.nextCursor,
    this.isLoadingEarlier = false,
    this.earlierFailure,
    this.activity,
    this.working = false,
    this.followFailure,
  });

  /// The first page read, as a board.
  HistoryBoard.from(HistoryPage page)
    : this(latest: page, events: page.events, nextCursor: page.nextCursor, activity: page.activity);

  /// The latest page — which is also what says what the conversation is: where it ran, where it
  /// began, what it is called.
  final HistoryPage latest;

  /// Every event read, oldest first — earlier pages are put in front, and what the conversation
  /// gained while followed goes after.
  final List<SessionEvent> events;

  /// The page before the oldest one read, or `null` when that was the first message.
  final String? nextCursor;

  /// An earlier page is being read. A second tap asks for nothing.
  final bool isLoadingEarlier;

  /// Why reading an earlier page failed. What is on screen stays, with the reason beside it.
  final Failure? earlierFailure;

  /// What the conversation is doing now — the page's, then the latest the subscription said.
  final ConversationActivity? activity;

  /// Whether Claude seems to be working on it in another client: an inference, said as one
  /// (plan 22, D-12). Only a subscription says it, so it is `false` without one.
  final bool working;

  /// Why the conversation is not being followed — the ceiling of subscriptions, say. The screen
  /// stays readable; it just does not grow by itself.
  final Failure? followFailure;

  /// Where the conversation ran, and so where a resume of it runs.
  String get workspacePath => latest.workspacePath;

  /// Whether it began outside this product, which is what the note before a resume is about.
  bool get beganElsewhere => latest.beganElsewhere;

  /// Whether something else wrote it a moment ago — what asks before a resume makes a copy of it.
  bool get isActiveElsewhere => activity == ConversationActivity.activeElsewhere;

  String get summary => latest.summary;

  /// Whether there is anything to show at all.
  bool get isEmpty => events.isEmpty && nextCursor == null;

  /// The events as a conversation, through the same fold the live stream uses — the page and what
  /// was appended to it are one list, so the result is the one a reading of everything gives (S-91).
  Conversation get conversation => const Conversation().withHistory(events);

  /// This board with what is given changed.
  HistoryBoard copyWith({
    List<SessionEvent>? events,
    Object? nextCursor = _same,
    bool? isLoadingEarlier,
    Object? earlierFailure = _same,
    Object? activity = _same,
    bool? working,
    Object? followFailure = _same,
  }) => HistoryBoard(
    latest: latest,
    events: events ?? this.events,
    nextCursor: identical(nextCursor, _same) ? this.nextCursor : nextCursor as String?,
    isLoadingEarlier: isLoadingEarlier ?? this.isLoadingEarlier,
    earlierFailure: identical(earlierFailure, _same)
        ? this.earlierFailure
        : earlierFailure as Failure?,
    activity: identical(activity, _same) ? this.activity : activity as ConversationActivity?,
    working: working ?? this.working,
    followFailure: identical(followFailure, _same) ? this.followFailure : followFailure as Failure?,
  );

  @override
  List<Object?> get props => <Object?>[
    latest,
    events,
    nextCursor,
    isLoadingEarlier,
    earlierFailure,
    activity,
    working,
    followFailure,
  ];
}

/// The history of one conversation, keyed by it.
///
/// After the first page it **follows** the conversation (`transcript.follow` from the page's
/// `lastMessageId`), and what arrives joins the events. It lets go when nobody shows it, when the app
/// goes to the background and when it is thrown away; it follows again when shown again, when the app
/// comes back and when the socket does — always from the last entry it has, so nothing is missed and
/// nothing comes twice (docs/architecture/mobile/04-ui.md, plan 22 · F4).
@riverpod
class ConversationHistoryController extends _$ConversationHistoryController {
  late FollowTranscript _follow;

  /// The subscription the server named, while there is one.
  String? _followId;

  /// The `transcript.follow` on its way, by the id it left with.
  String? _asking;

  /// Follows asked for and no longer wanted before their ack arrived: each is let go as soon as the
  /// ack names it, so no subscription is left on the server with nobody reading it.
  final Set<String> _abandoned = <String>{};

  /// The last `seq` of the subscription applied. A hole after it is a frame lost.
  int _seq = 0;

  /// The last entry the screen has — what the next follow starts after.
  String? _lastMessageId;

  /// A first page was read: nothing is followed before it says from where.
  bool _pageRead = false;

  /// A screen shows it.
  bool _shown = true;

  /// The app is in the foreground.
  bool _foreground = true;

  /// The socket is ready.
  bool _connected = false;

  @override
  Future<HistoryBoard> build(String conversationId) async {
    _keepForAWhile();
    _pageRead = false;
    _follow = ref.watch(followTranscriptProvider);

    final StreamSubscription<FollowUpdate> updates = _follow.updates.listen(_onUpdate);
    ref.onDispose(() {
      unawaited(updates.cancel());
      _release();
    });
    ref.listen<AsyncValue<ConnectionStatus>>(
      connectionStatusProvider,
      (AsyncValue<ConnectionStatus>? previous, AsyncValue<ConnectionStatus> next) =>
          _onConnection(next.value),
      fireImmediately: true,
    );

    final HistoryPage page = await ref.watch(readHistoryProvider)(conversationId);
    _read(page);
    return HistoryBoard.from(page);
  }

  /// Reads the latest page again — the recovery the error state offers.
  Future<void> reload() async {
    state = const AsyncValue<HistoryBoard>.loading();
    await _reread();
  }

  /// Reads the page before the oldest one on screen, and puts it in front.
  Future<void> loadEarlier() async {
    final HistoryBoard? board = state.value;
    final String? cursor = board?.nextCursor;

    if (board == null || cursor == null || board.isLoadingEarlier) {
      return;
    }

    state = AsyncValue<HistoryBoard>.data(
      board.copyWith(isLoadingEarlier: true, earlierFailure: null),
    );

    try {
      final HistoryPage page = await ref.read(readHistoryProvider)(conversationId, cursor: cursor);

      _settle(
        (HistoryBoard now) => now.copyWith(
          events: <SessionEvent>[...page.events, ...now.events],
          nextCursor: page.nextCursor,
          isLoadingEarlier: false,
        ),
      );
    } on Object catch (error) {
      _settle(
        (HistoryBoard now) =>
            now.copyWith(isLoadingEarlier: false, earlierFailure: asFailure(error)),
      );
    }
  }

  /// The app moved in its lifecycle: `paused` lets the subscription go — the socket goes too, and
  /// that is right —, and `resumed` follows again from the last entry the screen has (S-93).
  void lifecycleChanged(AppLifecycleState lifecycle) {
    switch (lifecycle) {
      case AppLifecycleState.paused:
        _foreground = false;
        _release();
        _change((HistoryBoard board) => board.copyWith(working: false));
      case AppLifecycleState.resumed:
        _foreground = true;
        _sync();
      case AppLifecycleState.inactive:
      case AppLifecycleState.hidden:
      case AppLifecycleState.detached:
        break;
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

  /// Changes the board on screen, when there is one.
  void _change(HistoryBoard Function(HistoryBoard board) change) {
    final HistoryBoard? board = ref.mounted ? state.value : null;

    if (board != null) {
      state = AsyncValue<HistoryBoard>.data(change(board));
    }
  }

  /// Reads the latest page again, and follows from it. What was followed is let go first: the page
  /// read afresh is the new starting point, and the old subscription's frames would be stitched onto
  /// a reading they do not continue.
  Future<void> _reread() async {
    _release();
    _pageRead = false;

    final AsyncValue<HistoryBoard> next = await AsyncValue.guard<HistoryBoard>(
      () async => HistoryBoard.from(await ref.read(readHistoryProvider)(conversationId)),
    );

    if (!ref.mounted) {
      return;
    }

    state = next;
    final HistoryBoard? board = next.value;

    if (board != null) {
      _read(board.latest);
    }
  }

  /// A first page was read: it says from where the conversation is followed.
  void _read(HistoryPage page) {
    _lastMessageId = page.lastMessageId;
    _pageRead = true;
    _sync();
  }

  /// Follows the conversation — when a page said from where, a screen shows it, the app is in the
  /// foreground, the socket is ready, and it is not followed or being followed already. One follow,
  /// however many of those change at once (S-94).
  void _sync() {
    if (!_pageRead ||
        !_shown ||
        !_foreground ||
        !_connected ||
        _followId != null ||
        _asking != null) {
      return;
    }

    _seq = 0;
    _asking = _follow.follow(conversationId, afterMessageId: _lastMessageId);
  }

  /// Lets the subscription go — the one there is, or the one on its way, once its ack names it.
  void _release() {
    final String? followId = _followId;
    final String? asking = _asking;
    _followId = null;
    _asking = null;

    if (asking != null) {
      _abandoned.add(asking);
    }

    if (followId != null) {
      _follow.unfollow(followId);
    }
  }

  void _onConnection(ConnectionStatus? status) {
    final bool connected = status == ConnectionStatus.ready;

    if (connected == _connected) {
      return;
    }

    _connected = connected;

    if (connected) {
      _sync();
      return;
    }

    // The socket went, and every subscription of it went with it on the server; an ack still on its
    // way never arrives. Nothing to let go, and "working" can no longer be said.
    _followId = null;
    _asking = null;
    _abandoned.clear();
    _change((HistoryBoard board) => board.copyWith(working: false));
  }

  void _onUpdate(FollowUpdate update) {
    switch (update) {
      case FollowStarted():
        _started(update);
      case FollowRefused():
        _refused(update);
      case FollowAppended():
        _appended(update);
      case FollowReset():
        _reset(update);
    }
  }

  void _started(FollowStarted ack) {
    if (_abandoned.remove(ack.commandId)) {
      _follow.unfollow(ack.followId);
      return;
    }

    if (ack.commandId != _asking) {
      return;
    }

    _asking = null;
    _followId = ack.followId;
    _seq = 0;
    _change(
      (HistoryBoard board) => board.copyWith(
        activity: ack.activity,
        working: board.working && ack.activity == ConversationActivity.activeElsewhere,
        followFailure: null,
      ),
    );
  }

  /// A refusal of **this** screen's follow — the ceiling, say. The conversation stays readable, with
  /// the reason beside it, and is not asked again until something changes (S-100).
  void _refused(FollowRefused refusal) {
    if (_abandoned.remove(refusal.commandId) || refusal.commandId != _asking) {
      return;
    }

    _asking = null;
    _change((HistoryBoard board) => board.copyWith(followFailure: refusal.failure, working: false));
  }

  void _appended(FollowAppended appended) {
    // A subscription that ended, or another screen's; or a frame already applied.
    if (appended.followId != _followId || appended.seq <= _seq) {
      return;
    }

    // A hole is a frame lost: read again and follow again, never patch (05 §Acompanhar).
    if (appended.seq != _seq + 1) {
      unawaited(_reread());
      return;
    }

    _seq = appended.seq;
    _lastMessageId = appended.lastMessageId ?? _lastMessageId;
    _change(
      (HistoryBoard board) => board.copyWith(
        events: appended.events.isEmpty
            ? board.events
            : <SessionEvent>[...board.events, ...appended.events],
        activity: appended.activity,
        working: appended.working,
      ),
    );
  }

  /// The chain was rewritten, or the conversation is gone: the subscription has ended, and the
  /// latest page is read again — which says what is there now, or that nothing is (S-92).
  void _reset(FollowReset reset) {
    if (reset.followId != _followId) {
      return;
    }

    _followId = null;
    unawaited(_reread());
  }

  /// Keeps what was read for [historyKeptFor] after the last listener leaves (S-16) — without
  /// following it: a conversation nobody shows is not followed (S-95).
  void _keepForAWhile() {
    final KeepAliveLink link = ref.keepAlive();
    Timer? release;

    ref.onCancel(() {
      _shown = false;
      _release();
      release = Timer(historyKeptFor, link.close);
    });
    ref.onResume(() {
      release?.cancel();
      _shown = true;
      _sync();
    });
    ref.onDispose(() => release?.cancel());
  }
}
