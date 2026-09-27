/// The history repository: the wire, parsed off the UI thread.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/data/datasources/history_api_data_source.dart';
import 'package:remote_claude/features/session/data/repositories/history_repository_impl.dart';
import 'package:remote_claude/features/session/domain/entities/history_page.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';
import 'package:remote_claude/features/session/domain/usecases/read_history.dart';

import '../../../../../support/builders/frames.dart';

/// Answers a fixed body, and keeps what it was asked.
class _Api implements HistoryApiDataSource {
  _Api(this.body);

  final Object? body;
  final List<(String, String?)> asked = <(String, String?)>[];

  @override
  Future<Object?> messages(String conversationId, {String? cursor}) async {
    asked.add((conversationId, cursor));
    return body;
  }
}

void main() {
  final Map<String, Object?> body = historyBody(
    events: <Map<String, Object?>>[
      historyEntry(messageCompleted(messageId: 'm1', text: 'hi', seq: 1)),
    ],
    nextCursor: 'm0',
  );

  test('B-08 · parses a page in another isolate, into the entities the screen uses', () async {
    final _Api api = _Api(body);

    final HistoryPage page = await HistoryRepositoryImpl(api).page('conv-1', cursor: 'm5');

    expect(api.asked.single, ('conv-1', 'm5'));
    expect(page.conversationId, 'conv-1');
    expect(page.events.single, isA<MessageFinished>());
    expect(page.nextCursor, 'm0');
  });

  test('the parse is the injected one, so where it runs is a decision, not an accident', () async {
    final List<Object?> parsed = <Object?>[];

    await HistoryRepositoryImpl(
      _Api(body),
      parse: (Object? raw) async {
        parsed.add(raw);
        return const HistoryPage(conversationId: 'conv-1', workspacePath: '/p');
      },
    ).page('conv-1');

    expect(parsed.single, same(body));
  });

  test('an answer that does not say which conversation it is a page of is a failure', () async {
    await expectLater(
      HistoryRepositoryImpl(_Api(<String, Object?>{'events': <Object?>[]})).page('conv-1'),
      throwsA(isA<UnexpectedFailure>()),
    );
  });

  test('the use case asks the repository for the page it was asked for', () async {
    final _Api api = _Api(body);

    await ReadHistory(HistoryRepositoryImpl(api))('conv-1', cursor: 'm2');

    expect(api.asked.single, ('conv-1', 'm2'));
  });
}
