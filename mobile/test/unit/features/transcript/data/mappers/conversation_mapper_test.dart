/// Reading the listing of the history.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/transcript/data/mappers/conversation_mapper.dart';
import 'package:remote_claude/features/transcript/transcript.dart';

import '../../../../../support/builders/transcripts.dart';

void main() {
  test('reads one conversation with everything it carries', () {
    expect(conversationFrom(conversationRow()), aConversation());
  });

  test('S-11 · the origin is read from the row, and "external" is not "the editor"', () {
    expect(
      conversationFrom(conversationRow(<String, Object?>{'origin': 'external'}))!.origin,
      ConversationOrigin.external,
    );
  });

  test('what the store may not know is absent rather than invented', () {
    final ConversationSummary conversation = conversationFrom(
      conversationRow(<String, Object?>{'gitBranch': null, 'createdAt': null, 'summary': null}),
    )!;

    expect(conversation.gitBranch, isNull);
    expect(conversation.createdAt, isNull);
    expect(conversation.summary, '');
  });

  test('instants are read as UTC, whatever offset they came with', () {
    final ConversationSummary conversation = conversationFrom(
      conversationRow(<String, Object?>{'lastModified': '2026-09-24T15:30:00.000-03:00'}),
    )!;

    expect(conversation.lastModified, DateTime.utc(2026, 9, 24, 18, 30));
    expect(conversation.lastModified.isUtc, isTrue);
  });

  test('a row the app cannot read is dropped', () {
    final List<Object?> unreadable = <Object?>[
      null,
      'conv-1',
      conversationRow(<String, Object?>{'sessionId': null}),
      conversationRow(<String, Object?>{'cwd': 7}),
      conversationRow(<String, Object?>{'origin': 'vscode'}),
      conversationRow(<String, Object?>{'lastModified': 'yesterday'}),
      conversationRow(<String, Object?>{'lastModified': null}),
    ];

    for (final Object? row in unreadable) {
      expect(conversationFrom(row), isNull, reason: '$row');
    }
  });

  test('a page keeps the backend’s order, drops what it cannot read, and says where next', () {
    final ConversationList page = conversationListFrom(<String, Object?>{
      'sessions': <Object?>[
        conversationRow(<String, Object?>{'sessionId': 'b'}),
        'not a row',
        conversationRow(<String, Object?>{'sessionId': 'a'}),
      ],
      'nextCursor': 'cursor-2',
    });

    expect(page.conversations.map((ConversationSummary c) => c.conversationId), <String>['b', 'a']);
    expect(page.nextCursor, 'cursor-2');
  });

  test('a body that is not a page is an empty one with nothing after it', () {
    expect(conversationListFrom(null), const ConversationList());
    expect(conversationListFrom(<String, Object?>{'sessions': 'x'}), const ConversationList());
  });

  test('the wire names the origins this build knows, and no others', () {
    expect(ConversationOrigin.fromWire('ours'), ConversationOrigin.ours);
    expect(ConversationOrigin.fromWire('external'), ConversationOrigin.external);
    expect(ConversationOrigin.fromWire('terminal'), isNull);
    expect(ConversationOrigin.fromWire(1), isNull);
  });
}
