/// One conversation of the history: its pages, the earlier ones, and how long it is kept.
library;

import 'dart:async';

import 'package:fake_async/fake_async.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/history_page.dart';
import 'package:remote_claude/features/session/domain/repositories/history_repository.dart';
import 'package:remote_claude/features/session/presentation/providers/conversation_history_controller.dart';
import 'package:remote_claude/features/session/session_providers.dart';

import '../../../../../support/builders/frames.dart';
import '../../../../../support/fakes/fake_history_repository.dart';

const Failure timeout = ServerFailure(
  code: 'CLAUDE_TIMEOUT',
  messageKey: 'transcript.error.claudeTimeout',
  traceId: 'trace-5',
);

HistoryPage latest({String? nextCursor = 'm3'}) => HistoryPage(
  conversationId: 'conv-1',
  workspacePath: '/home/someone/project',
  beganElsewhere: true,
  summary: 'Fix the build',
  events: historyOf(<String>[
    messageCompleted(messageId: 'm3', text: 'third', seq: 1),
    messageCompleted(messageId: 'm4', text: 'fourth', seq: 2),
  ]),
  nextCursor: nextCursor,
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

void main() {
  late FakeHistoryRepository history;
  late ProviderContainer container;

  setUp(() {
    history = FakeHistoryRepository()
      ..answer(latest())
      ..answer(earlier(), cursor: 'm3');
    container = ProviderContainer(
      overrides: <Override>[
        historyRepositoryProvider.overrideWithValue(history as HistoryRepository),
      ],
    );
    addTearDown(container.dispose);
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
      final ProviderContainer local = ProviderContainer(
        overrides: <Override>[
          historyRepositoryProvider.overrideWithValue(history as HistoryRepository),
        ],
      );
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
}

extension on HistoryPage {
  HistoryPage copyWithNoEvents() => HistoryPage(
    conversationId: conversationId,
    workspacePath: workspacePath,
    nextCursor: nextCursor,
  );
}
