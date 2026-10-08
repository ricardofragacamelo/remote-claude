/// One conversation of the history: its pages, the earlier ones, how long it is kept — and how it is
/// followed while another client writes it (plan 22, B-25).
library;

import 'dart:async';

import 'package:fake_async/fake_async.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/history_page.dart';
import 'package:remote_claude/features/session/domain/entities/transcript_follow.dart';
import 'package:remote_claude/features/session/domain/repositories/history_repository.dart';
import 'package:remote_claude/features/session/domain/repositories/transcript_follow_repository.dart';
import 'package:remote_claude/features/session/presentation/providers/conversation_history_controller.dart';
import 'package:remote_claude/features/session/session_providers.dart';

import '../../../../../support/builders/frames.dart';
import '../../../../../support/fakes/fake_history_repository.dart';
import '../../../../../support/fakes/fake_transcript_follow_repository.dart';

const Failure timeout = ServerFailure(
  code: 'CLAUDE_TIMEOUT',
  messageKey: 'transcript.error.claudeTimeout',
  traceId: 'trace-5',
);

const Failure followLimit = ServerFailure(
  code: 'TRANSCRIPT_FOLLOW_LIMIT',
  messageKey: 'transcript.error.followLimit',
  traceId: 'trace-9',
  params: <String, String>{'limit': '8', 'scope': 'connection'},
);

const Failure notFound = ServerFailure(
  code: 'NOT_FOUND',
  messageKey: 'transcript.error.notFound',
  traceId: 'trace-4',
);

HistoryPage latest({
  String? nextCursor = 'm3',
  String? lastMessageId = 'u-41',
  ConversationActivity? activity = ConversationActivity.activeElsewhere,
  List<String>? lines,
}) => HistoryPage(
  conversationId: 'conv-1',
  workspacePath: '/home/someone/project',
  beganElsewhere: true,
  summary: 'Fix the build',
  events: historyOf(
    lines ??
        <String>[
          messageCompleted(messageId: 'm3', text: 'third', seq: 1),
          messageCompleted(messageId: 'm4', text: 'fourth', seq: 2),
        ],
  ),
  nextCursor: nextCursor,
  activity: activity,
  lastMessageId: lastMessageId,
);

HistoryPage earlier({String? nextCursor}) => HistoryPage(
  conversationId: 'conv-1',
  workspacePath: '/home/someone/project',
  events: historyOf(<String>[
    messageCompleted(messageId: 'm1', text: 'first', seq: 1),
    messageCompleted(messageId: 'm2', text: 'second', seq: 2),
  ]),
  nextCursor: nextCursor,
);

/// What a followed conversation gained, as the subscription [followId] numbers it.
FollowAppended appendedOf(
  int seq, {
  String followId = 't-1',
  List<String> lines = const <String>[],
  String? lastMessageId,
  ConversationActivity? activity = ConversationActivity.activeElsewhere,
  bool working = false,
}) => FollowAppended(
  followId: followId,
  conversationId: 'conv-1',
  seq: seq,
  events: historyOf(lines),
  lastMessageId: lastMessageId,
  activity: activity,
  working: working,
);

void main() {
  late FakeHistoryRepository history;
  late FakeTranscriptFollowRepository follows;
  late StreamController<ConnectionStatus> connection;
  late ProviderContainer container;

  List<Override> overrides() => <Override>[
    historyRepositoryProvider.overrideWithValue(history as HistoryRepository),
    transcriptFollowRepositoryProvider.overrideWithValue(follows as TranscriptFollowRepository),
    connectionStatusProvider.overrideWith((Ref ref) => connection.stream),
  ];

  setUp(() {
    history = FakeHistoryRepository()
      ..answer(latest())
      ..answer(earlier(), cursor: 'm3');
    follows = FakeTranscriptFollowRepository();
    connection = StreamController<ConnectionStatus>.broadcast();
    container = ProviderContainer(overrides: overrides());
    addTearDown(container.dispose);
    // Not awaited: a stream nobody reads any more never says it is done.
    addTearDown(() => unawaited(follows.dispose()));
    addTearDown(() => unawaited(connection.close()));
  });

  ConversationHistoryControllerProvider provider() =>
      conversationHistoryControllerProvider('conv-1');

  ProviderSubscription<AsyncValue<HistoryBoard>> hold() {
    final ProviderSubscription<AsyncValue<HistoryBoard>> held = container.listen(
      provider(),
      (AsyncValue<HistoryBoard>? previous, AsyncValue<HistoryBoard> next) {},
    );
    addTearDown(held.close);
    return held;
  }

  Future<HistoryBoard> loaded() => container.read(provider().future);

  List<String> texts(HistoryBoard board) =>
      board.conversation.messages.map((StreamMessage m) => m.text).toList(growable: false);

  test('reads the latest page, and says what the conversation is', () async {
    hold();

    final HistoryBoard board = await loaded();

    expect(history.reads, <(String, String?)>[('conv-1', null)]);
    expect(texts(board), <String>['third', 'fourth']);
    expect(board.workspacePath, '/home/someone/project');
    expect(board.beganElsewhere, isTrue);
    expect(board.summary, 'Fix the build');
    expect(board.isEmpty, isFalse);
  });

  test('a conversation with nothing in it and nothing before is empty', () async {
    history.answer(latest(nextCursor: null).copyWithNoEvents());
    hold();

    expect((await loaded()).isEmpty, isTrue);
  });

  test('loading earlier puts the page before in front, and says when there is no more', () async {
    hold();
    await loaded();

    await container.read(provider().notifier).loadEarlier();

    final HistoryBoard board = container.read(provider()).value!;
    expect(history.reads.last, ('conv-1', 'm3'));
    expect(texts(board), <String>['first', 'second', 'third', 'fourth']);
    expect(board.nextCursor, isNull);
    expect(board.isLoadingEarlier, isFalse);
  });

  test('there is nothing earlier to load on the first message, and nothing is asked', () async {
    history.answer(latest(nextCursor: null));
    hold();
    await loaded();

    await container.read(provider().notifier).loadEarlier();

    expect(history.reads, hasLength(1));
  });

  test('a second tap while an earlier page is on its way asks once', () async {
    hold();
    await loaded();
    history.gate = Completer<void>();

    final Future<void> first = container.read(provider().notifier).loadEarlier();
    await container.read(provider().notifier).loadEarlier();
    expect(container.read(provider()).value!.isLoadingEarlier, isTrue);

    history.gate!.complete();
    await first;

    expect(history.reads, hasLength(2));
  });

  test('an earlier page that failed keeps what is on screen, with the reason', () async {
    hold();
    await loaded();
    history.failure = timeout;

    await container.read(provider().notifier).loadEarlier();

    final HistoryBoard board = container.read(provider()).value!;
    expect(texts(board), <String>['third', 'fourth']);
    expect(board.earlierFailure, timeout);
    expect(board.nextCursor, 'm3');

    history.failure = null;
    await container.read(provider().notifier).loadEarlier();
    expect(container.read(provider()).value!.earlierFailure, isNull);
  });

  test('an earlier page that answers after a reload is not stitched onto it', () async {
    hold();
    await loaded();
    history.gate = Completer<void>();

    final Future<void> earlierPage = container.read(provider().notifier).loadEarlier();
    final Future<void> reloaded = container.read(provider().notifier).reload();
    history.gate!.complete();
    await Future.wait(<Future<void>>[earlierPage, reloaded]);

    expect(texts(container.read(provider()).value!), <String>['third', 'fourth']);
  });

  test('S-17 · a first page that failed is the error, and the retry reads it again', () async {
    history.failure = timeout;
    hold();
    await Future<void>.delayed(Duration.zero);

    // Read as a property: a first build that failed is still settling, and arrives as loading
    // with the error on it — the reason `LoadedView` reads it the same way.
    expect(container.read(provider()).error, timeout);

    history.failure = null;
    await container.read(provider().notifier).reload();

    expect(container.read(provider()).value, isNotNull);
    expect(history.reads, hasLength(2));
  });

  test('S-16 · opened again within the window, it is read once', () {
    fakeAsync((FakeAsync async) {
      final ProviderContainer local = ProviderContainer(overrides: overrides());
      final ConversationHistoryControllerProvider watched = conversationHistoryControllerProvider(
        'conv-1',
      );

      local.listen(watched, (Object? previous, Object? next) {}).close();
      async.flushMicrotasks();
      async.elapse(const Duration(seconds: 10));

      // Back, then in again: the screen is new, the reading is not.
      final ProviderSubscription<AsyncValue<HistoryBoard>> again = local.listen(
        watched,
        (Object? previous, Object? next) {},
      );
      async.flushMicrotasks();
      expect(history.reads, hasLength(1));
      expect(local.read(watched).hasValue, isTrue);

      // Left for longer than the window, it is forgotten, and the next opening reads again.
      again.close();
      async.elapse(historyKeptFor + const Duration(seconds: 1));
      local.listen(watched, (Object? previous, Object? next) {}).close();
      async.flushMicrotasks();
      expect(history.reads, hasLength(2));

      local.dispose();
      async.elapse(historyKeptFor * 2);
    });
  });

  test('two boards with the same pages are equal', () {
    expect(HistoryBoard.from(latest()), HistoryBoard.from(latest()));
    expect(HistoryBoard.from(latest()), isNot(HistoryBoard.from(earlier())));
  });

  group('following — plan 22, B-25', () {
    Future<void> settle() => Future<void>.delayed(Duration.zero);

    ConversationHistoryController notifier() => container.read(provider().notifier);

    HistoryBoard board() => container.read(provider()).value!;

    /// The screen open on the conversation, the socket ready, and the follow answered as [followId].
    Future<void> followed({String followId = 't-1'}) async {
      hold();
      await loaded();
      connection.add(ConnectionStatus.ready);
      await settle();
      follows.ack(followId, activity: ConversationActivity.activeElsewhere);
      await settle();
    }

    test('follows after the first page, from the last entry it says — never before it', () async {
      history.gate = Completer<void>();
      hold();
      connection.add(ConnectionStatus.ready);
      await settle();

      expect(follows.follows, isEmpty);

      history.gate!.complete();
      await loaded();
      await settle();

      expect(follows.follows, <(String, String, String?)>[('follow-1', 'conv-1', 'u-41')]);
    });

    test('waits for the socket, and follows once it is ready', () async {
      hold();
      await loaded();
      connection.add(ConnectionStatus.connecting);
      await settle();

      expect(follows.follows, isEmpty);

      connection.add(ConnectionStatus.ready);
      connection.add(ConnectionStatus.ready);
      await settle();

      expect(follows.follows, hasLength(1));
    });

    test('S-89 · a conversation with no entry is followed from its beginning', () async {
      history.answer(latest(lastMessageId: null, nextCursor: null, lines: const <String>[]));

      await followed();

      expect(follows.follows.single.$3, isNull);
    });

    test('a follow that could not leave is tried again when the socket comes back', () async {
      follows.accepts = false;
      hold();
      await loaded();
      connection.add(ConnectionStatus.ready);
      await settle();
      expect(follows.follows, isEmpty);

      follows.accepts = true;
      connection
        ..add(ConnectionStatus.reconnecting)
        ..add(ConnectionStatus.ready);
      await settle();

      expect(follows.follows, hasLength(1));
    });

    test(
      'S-91 · what arrives joins the conversation, and is what reading everything gives',
      () async {
        await followed();
        final List<String> more = <String>[
          messageCompleted(messageId: 'm5', text: 'fifth', role: 'user', seq: 3),
          toolStarted(toolUseId: 'tool-1', seq: 4),
        ];

        follows.emit(appendedOf(1, lines: more, lastMessageId: 'u-44', working: true));
        await settle();

        final HistoryBoard now = board();
        final HistoryBoard everything = HistoryBoard.from(
          latest(
            lines: <String>[
              messageCompleted(messageId: 'm3', text: 'third', seq: 1),
              messageCompleted(messageId: 'm4', text: 'fourth', seq: 2),
              ...more,
            ],
          ),
        );
        expect(texts(now), <String>['third', 'fourth', 'fifth']);
        expect(now.conversation, everything.conversation);
        expect(now.working, isTrue);
        expect(now.isActiveElsewhere, isTrue);

        // The tool ends in the next frame: the same entry, now finished — not a second one.
        follows.emit(
          appendedOf(
            2,
            lines: <String>[toolCompleted(toolUseId: 'tool-1', seq: 5)],
            working: false,
          ),
        );
        await settle();

        expect(board().conversation.entries.whereType<ToolExecution>(), hasLength(1));
        expect(board().working, isFalse);
      },
    );

    test('a frame with no entries says only what the conversation is doing', () async {
      await followed();

      follows.emit(appendedOf(1, activity: ConversationActivity.idle));
      await settle();

      expect(board().events, hasLength(2));
      expect(board().activity, ConversationActivity.idle);
      expect(board().isActiveElsewhere, isFalse);
    });

    test("a frame of another subscription, or one already applied, changes nothing", () async {
      await followed();
      final List<String> line = <String>[messageCompleted(messageId: 'm5', text: 'fifth', seq: 3)];

      follows.emit(appendedOf(1, followId: 't-other', lines: line));
      follows.emit(appendedOf(1, lines: line));
      follows.emit(appendedOf(1, lines: line));
      await settle();

      expect(texts(board()), <String>['third', 'fourth', 'fifth']);
    });

    test(
      'a hole in the numbering reads the page again and follows from it, never patches',
      () async {
        await followed();
        history.answer(latest(lastMessageId: 'u-50'));

        follows.emit(
          appendedOf(
            3,
            lines: <String>[messageCompleted(messageId: 'm9', text: 'ninth', seq: 9)],
          ),
        );
        await settle();
        await settle();

        expect(history.reads, hasLength(2));
        expect(follows.unfollows, <String>['t-1']);
        expect(texts(board()), <String>['third', 'fourth']);
        expect(follows.follows.last, ('follow-2', 'conv-1', 'u-50'));
      },
    );

    test('S-92 · a rewritten chain reads the page again and follows again', () async {
      await followed();
      history.answer(latest(lastMessageId: 'u-60'));

      follows.emit(
        const FollowReset(
          followId: 't-other',
          conversationId: 'conv-1',
          seq: 1,
          reason: FollowResetReason.rewritten,
        ),
      );
      await settle();
      expect(history.reads, hasLength(1));

      follows.emit(
        const FollowReset(
          followId: 't-1',
          conversationId: 'conv-1',
          seq: 1,
          reason: FollowResetReason.rewritten,
        ),
      );
      await settle();
      await settle();

      expect(history.reads, hasLength(2));
      // The subscription ended on the server: there is nothing to let go.
      expect(follows.unfollows, isEmpty);
      expect(follows.follows.last, ('follow-2', 'conv-1', 'u-60'));

      // What the old subscription might still say is not stitched onto the new reading.
      follows.emit(
        appendedOf(
          1,
          lines: <String>[messageCompleted(messageId: 'm7', text: 'x', seq: 7)],
        ),
      );
      await settle();
      expect(texts(board()), <String>['third', 'fourth']);
    });

    test('S-92 · a conversation that is gone says so, as the page does', () async {
      await followed();
      history.failure = notFound;

      follows.emit(
        const FollowReset(
          followId: 't-1',
          conversationId: 'conv-1',
          seq: 1,
          reason: FollowResetReason.gone,
        ),
      );
      await settle();
      await settle();

      expect(container.read(provider()).error, notFound);
      expect(follows.follows, hasLength(1));
    });

    test('S-93 · paused lets go; resumed follows again from the last entry it has', () async {
      await followed();
      follows.emit(appendedOf(1, lastMessageId: 'u-44', working: true));
      await settle();

      notifier().lifecycleChanged(AppLifecycleState.paused);

      expect(follows.unfollows, <String>['t-1']);
      expect(board().working, isFalse);

      // Nothing of the old subscription is applied after it was let go.
      follows.emit(
        appendedOf(
          2,
          lines: <String>[messageCompleted(messageId: 'm8', text: 'late', seq: 8)],
        ),
      );
      await settle();
      expect(texts(board()), <String>['third', 'fourth']);

      // Neither is a transition that changes nothing here.
      notifier()
        ..lifecycleChanged(AppLifecycleState.inactive)
        ..lifecycleChanged(AppLifecycleState.hidden)
        ..lifecycleChanged(AppLifecycleState.detached);
      expect(follows.follows, hasLength(1));

      notifier().lifecycleChanged(AppLifecycleState.resumed);

      expect(follows.follows.last, ('follow-2', 'conv-1', 'u-44'));
    });

    test('a follow let go before its ack is let go as soon as the ack names it', () async {
      hold();
      await loaded();
      connection.add(ConnectionStatus.ready);
      await settle();

      notifier().lifecycleChanged(AppLifecycleState.paused);
      follows.ack('t-late');
      await settle();

      expect(follows.unfollows, <String>['t-late']);

      // And the refusal of a follow let go says nothing on screen.
      notifier().lifecycleChanged(AppLifecycleState.resumed);
      notifier().lifecycleChanged(AppLifecycleState.paused);
      follows.emit(FollowRefused(commandId: follows.lastCommand, failure: followLimit));
      await settle();
      expect(board().followFailure, isNull);
    });

    test(
      'S-94 · the socket that falls and comes back follows again, once, without duplicating',
      () async {
        await followed();
        follows.emit(
          appendedOf(
            1,
            lines: <String>[messageCompleted(messageId: 'm5', text: 'fifth', seq: 3)],
            lastMessageId: 'u-44',
            working: true,
          ),
        );
        await settle();

        connection.add(ConnectionStatus.reconnecting);
        await settle();

        // The server let the subscription go with the socket: nothing to send, and "working" is not
        // said any more.
        expect(follows.unfollows, isEmpty);
        expect(board().working, isFalse);

        connection
          ..add(ConnectionStatus.ready)
          ..add(ConnectionStatus.ready);
        await settle();

        expect(follows.follows, hasLength(2));
        expect(follows.follows.last.$3, 'u-44');

        // The old subscription's frames are not applied; the new one's are, from after u-44 — and the
        // entry that is already here, delivered again, is still one.
        follows.emit(
          appendedOf(
            2,
            lines: <String>[messageCompleted(messageId: 'm6', text: 'stale', seq: 6)],
          ),
        );
        follows.ack('t-2');
        await settle();
        follows.emit(
          appendedOf(
            1,
            followId: 't-2',
            lines: <String>[
              messageCompleted(messageId: 'm5', text: 'fifth', seq: 3),
              messageCompleted(messageId: 'm7', text: 'seventh', seq: 7),
            ],
          ),
        );
        await settle();

        expect(texts(board()), <String>['third', 'fourth', 'fifth', 'seventh']);
      },
    );

    test('an ack for a follow the fallen socket was carrying is not taken', () async {
      hold();
      await loaded();
      connection.add(ConnectionStatus.ready);
      await settle();

      connection.add(ConnectionStatus.reconnecting);
      await settle();
      follows.ack('t-orphan');
      await settle();

      expect(follows.unfollows, isEmpty);
      follows.emit(
        appendedOf(
          1,
          followId: 't-orphan',
          lines: <String>[messageCompleted(messageId: 'm5', text: 'fifth', seq: 3)],
        ),
      );
      await settle();
      expect(texts(board()), <String>['third', 'fourth']);
    });

    test('S-95 · a conversation nobody shows is not followed; shown again, it is', () async {
      final ProviderSubscription<AsyncValue<HistoryBoard>> held = hold();
      await loaded();
      connection.add(ConnectionStatus.ready);
      await settle();
      follows.ack('t-1');
      await settle();

      held.close();
      await settle();

      expect(follows.unfollows, <String>['t-1']);

      hold();
      await settle();

      expect(follows.follows, hasLength(2));
    });

    test('S-95 · a provider thrown away lets its subscription go', () async {
      await followed();

      container.dispose();

      expect(follows.unfollows, <String>['t-1']);
    });

    test(
      'S-100 · the ceiling is said, the conversation stays readable, and a later follow clears it',
      () async {
        hold();
        await loaded();
        connection.add(ConnectionStatus.ready);
        await settle();

        // Somebody else's refusal is not ours.
        follows.emit(const FollowRefused(commandId: 'other-command', failure: notFound));
        await settle();
        expect(board().followFailure, isNull);

        follows.emit(FollowRefused(commandId: follows.lastCommand, failure: followLimit));
        await settle();

        expect(board().followFailure, followLimit);
        expect(texts(board()), <String>['third', 'fourth']);
        expect(follows.follows, hasLength(1));

        connection
          ..add(ConnectionStatus.reconnecting)
          ..add(ConnectionStatus.ready);
        await settle();
        follows.ack('t-2', activity: ConversationActivity.idle);
        await settle();

        expect(board().followFailure, isNull);
        expect(board().activity, ConversationActivity.idle);
      },
    );

    test("the ack's activity is the conversation's now, and an idle one is not working", () async {
      await followed();
      follows.emit(appendedOf(1, working: true));
      await settle();
      expect(board().working, isTrue);

      notifier().lifecycleChanged(AppLifecycleState.paused);
      notifier().lifecycleChanged(AppLifecycleState.resumed);
      follows.ack('t-2', activity: null);
      await settle();

      expect(board().activity, isNull);
      expect(board().working, isFalse);
    });

    test('an earlier page that arrives while it is followed keeps what was appended', () async {
      await followed();
      history.gate = Completer<void>();

      final Future<void> earlierPage = notifier().loadEarlier();
      follows.emit(
        appendedOf(
          1,
          lines: <String>[messageCompleted(messageId: 'm5', text: 'fifth', seq: 3)],
        ),
      );
      await settle();
      history.gate!.complete();
      await earlierPage;

      expect(texts(board()), <String>['first', 'second', 'third', 'fourth', 'fifth']);
    });
  });

  group('the board', () {
    test('copies what is not given, and clears what is given as nothing', () {
      final HistoryBoard board = HistoryBoard.from(
        latest(),
      ).copyWith(earlierFailure: notFound, followFailure: followLimit, working: true);

      expect(board.copyWith(), board);
      expect(board.copyWith(earlierFailure: null).earlierFailure, isNull);
      expect(board.copyWith(followFailure: null).followFailure, isNull);
      expect(board.copyWith(activity: null).activity, isNull);
      expect(board.copyWith(nextCursor: null).nextCursor, isNull);
      expect(board.copyWith(isLoadingEarlier: true).isLoadingEarlier, isTrue);
      expect(board.activity, ConversationActivity.activeElsewhere);
      expect(board, isNot(board.copyWith(working: false)));
    });
  });
}

extension on HistoryPage {
  HistoryPage copyWithNoEvents() => HistoryPage(
    conversationId: conversationId,
    workspacePath: workspacePath,
    nextCursor: nextCursor,
  );
}
