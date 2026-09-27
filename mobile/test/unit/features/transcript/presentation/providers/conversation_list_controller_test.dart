/// The conversations of one workspace, page after page.
library;

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/transcript/domain/repositories/transcript_repository.dart';
import 'package:remote_claude/features/transcript/transcript.dart';
import 'package:remote_claude/features/transcript/transcript_providers.dart';

import '../../../../../support/builders/transcripts.dart';
import '../../../../../support/fakes/fake_transcript_repository.dart';

const String workspace = '/home/someone/project';

const Failure unavailable = ServerFailure(
  code: 'CLAUDE_UNAVAILABLE',
  messageKey: 'transcript.error.claudeUnavailable',
  traceId: 'trace-2',
);

void main() {
  late FakeTranscriptRepository transcripts;
  late ProviderContainer container;

  setUp(() {
    transcripts = FakeTranscriptRepository()
      ..answer(
        workspace,
        ConversationList(
          conversations: <ConversationSummary>[aConversation(conversationId: 'newest')],
          nextCursor: 'page-2',
        ),
      )
      ..answer(
        workspace,
        ConversationList(
          conversations: <ConversationSummary>[aConversation(conversationId: 'older')],
        ),
        cursor: 'page-2',
      );
    container = ProviderContainer(
      overrides: <Override>[
        transcriptRepositoryProvider.overrideWithValue(transcripts as TranscriptRepository),
      ],
    );
    final ProviderSubscription<AsyncValue<ConversationBoard>> held = container.listen(
      conversationListControllerProvider(workspace),
      (AsyncValue<ConversationBoard>? previous, AsyncValue<ConversationBoard> next) {},
    );
    addTearDown(() {
      held.close();
      container.dispose();
    });
  });

  ConversationListController controller() =>
      container.read(conversationListControllerProvider(workspace).notifier);
  AsyncValue<ConversationBoard> value() =>
      container.read(conversationListControllerProvider(workspace));
  Future<ConversationBoard> loaded() =>
      container.read(conversationListControllerProvider(workspace).future);

  List<String> ids() => value().value!.conversations
      .map((ConversationSummary c) => c.conversationId)
      .toList(growable: false);

  test('S-12 · reads the first page of exactly the workspace it is keyed by', () async {
    await loaded();

    expect(transcripts.reads, <(String, String?)>[(workspace, null)]);
    expect(ids(), <String>['newest']);
    expect(value().value!.nextCursor, 'page-2');
  });

  test('the next page goes after what is on screen, and the end says so', () async {
    await loaded();

    await controller().loadMore();

    expect(transcripts.reads.last, (workspace, 'page-2'));
    expect(ids(), <String>['newest', 'older']);
    expect(value().value!.nextCursor, isNull);
    expect(value().value!.isLoadingMore, isFalse);
  });

  test('after the last page, loading more asks for nothing', () async {
    await loaded();
    await controller().loadMore();

    await controller().loadMore();

    expect(transcripts.reads, hasLength(2));
  });

  test('a second tap while the next page is on its way asks once', () async {
    await loaded();
    transcripts.gate = Completer<void>();

    final Future<void> first = controller().loadMore();
    await controller().loadMore();
    expect(value().value!.isLoadingMore, isTrue);

    transcripts.gate!.complete();
    await first;

    expect(transcripts.reads, hasLength(2));
  });

  test('a next page that failed keeps the list, with the reason beside the button', () async {
    await loaded();
    transcripts.failure = unavailable;

    await controller().loadMore();

    expect(ids(), <String>['newest']);
    expect(value().value!.moreFailure, unavailable);
    expect(value().value!.nextCursor, 'page-2');

    transcripts.failure = null;
    await controller().loadMore();
    expect(value().value!.moreFailure, isNull);
    expect(ids(), <String>['newest', 'older']);
  });

  test('a next page answering after a reload is not stitched onto the fresh list', () async {
    await loaded();
    transcripts.gate = Completer<void>();

    final Future<void> more = controller().loadMore();
    final Future<void> reloaded = controller().reload();
    transcripts.gate!.complete();
    await Future.wait(<Future<void>>[more, reloaded]);

    expect(ids(), <String>['newest']);
  });

  test('a first page that failed is the error, and the retry reads it again', () async {
    transcripts.failure = unavailable;
    await container.read(conversationListControllerProvider(workspace).notifier).reload();

    expect(value().error, unavailable);

    transcripts.failure = null;
    await controller().reload();

    expect(ids(), <String>['newest']);
  });

  test('two boards with the same rows are equal', () {
    expect(const ConversationBoard(), const ConversationBoard());
    expect(const ConversationBoard(isLoadingMore: true), isNot(const ConversationBoard()));
  });
}
