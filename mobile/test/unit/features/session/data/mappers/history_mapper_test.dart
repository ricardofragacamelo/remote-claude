/// Reading a page of the history endpoint.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/data/mappers/history_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/history_page.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';
import 'package:remote_claude/features/session/domain/entities/transcript_follow.dart';

import '../../../../../support/builders/frames.dart';

void main() {
  test('reads the conversation, its events oldest first, and where the page before starts', () {
    final HistoryPage page = historyPageFrom(
      historyBody(
        events: <Map<String, Object?>>[
          historyEntry(messageCompleted(messageId: 'm1', text: 'hi', seq: 1, role: 'user')),
          historyEntry(toolStarted(toolUseId: 't1', seq: 2)),
        ],
        nextCursor: 'm0',
      ),
    )!;

    expect(page.conversationId, 'conv-1');
    expect(page.workspacePath, '/home/someone/project');
    expect(page.summary, 'Fix the build');
    expect(page.beganElsewhere, isFalse);
    expect(page.nextCursor, 'm0');
    expect(page.events.map((SessionEvent e) => e.runtimeType), <Type>[
      MessageFinished,
      ToolInvoked,
    ]);
  });

  test('D-04 · a conversation that began elsewhere says so', () {
    expect(historyPageFrom(historyBody(origin: 'external'))!.beganElsewhere, isTrue);
  });

  test('the first page of a conversation has no page before it, and may say nothing', () {
    final HistoryPage page = historyPageFrom(
      historyBody()
        ..remove('events')
        ..remove('nextCursor'),
    )!;

    expect(page.events, isEmpty);
    expect(page.nextCursor, isNull);
  });

  test('one unreadable entry costs that entry, not the page', () {
    final HistoryPage page = historyPageFrom(
      historyBody(
        events: <Map<String, Object?>>[
          <String, Object?>{'type': 'message.completed'},
          historyEntry(messageCompleted(messageId: 'm1', text: 'hi', seq: 1)),
        ],
      ),
    )!;

    expect(page.events, hasLength(1));
  });

  group('S-89 · what the conversation is doing, and the last entry it has — plan 22, B-24', () {
    test('are read from the page', () {
      final HistoryPage page = historyPageFrom(
        historyBody(activity: 'activeElsewhere', lastMessageId: 'u-41'),
      )!;

      expect(page.activity, ConversationActivity.activeElsewhere);
      expect(page.lastMessageId, 'u-41');
      expect(historyPageFrom(historyBody(activity: 'idle'))!.activity, ConversationActivity.idle);
      expect(
        historyPageFrom(historyBody(activity: 'liveHere'))!.activity,
        ConversationActivity.liveHere,
      );
    });

    test('absent — a server older than plan 22 — are nothing, and the page is still a page', () {
      final HistoryPage page = historyPageFrom(historyBody())!;

      expect(page.activity, isNull);
      expect(page.lastMessageId, isNull);
      expect(page.events, isEmpty);
    });

    test('an activity this build does not know, or a last entry that is not text, say nothing', () {
      final Map<String, Object?> body = historyBody(activity: 'somewhereNew')
        ..['lastMessageId'] = 41;

      final HistoryPage page = historyPageFrom(body)!;

      expect(page.activity, isNull);
      expect(page.lastMessageId, isNull);
    });

    test('two pages differ by them', () {
      expect(
        historyPageFrom(historyBody(lastMessageId: 'u-1')),
        isNot(historyPageFrom(historyBody(lastMessageId: 'u-2'))),
      );
    });
  });

  test('a conversation with no summary is called nothing, not "null"', () {
    final Map<String, Object?> body = historyBody();
    (body['session']! as Map<String, Object?>).remove('summary');

    expect(historyPageFrom(body)!.summary, '');
  });

  test('a body that does not say which conversation it is a page of is not a page', () {
    Map<String, Object?> without(String key, [Object? value]) {
      final Map<String, Object?> body = historyBody();
      final Map<String, Object?> session = body['session']! as Map<String, Object?>;
      if (value == null) {
        session.remove(key);
      } else {
        session[key] = value;
      }
      return body;
    }

    final List<Object?> unreadable = <Object?>[
      null,
      'a page',
      <String, Object?>{'events': <Object?>[]},
      <String, Object?>{'session': 'conv-1'},
      without('sessionId'),
      without('cwd'),
      without('origin'),
      // An origin this build does not know is not "ours" by default.
      without('origin', 'vscode'),
    ];

    for (final Object? body in unreadable) {
      expect(historyPageFrom(body), isNull, reason: '$body');
    }
  });
}
