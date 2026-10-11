/// A conversation on the wire — `{ engine, id }` — and back (plan 28, B-13).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/conversation/conversation_key.dart';
import 'package:remote_claude/core/network/conversation_wire.dart';

void main() {
  const ConversationKey conversation = ConversationKey(engine: 'engine-a', id: 'c-1');

  group('reading a conversation', () {
    test('reads the engine and the id the contract carries', () {
      expect(
        conversationKeyFrom(<String, Object?>{'engine': 'engine-a', 'id': 'c-1'}),
        conversation,
      );
    });

    test('keys it does not know are ignored, never refused', () {
      expect(
        conversationKeyFrom(<String, Object?>{'engine': 'engine-a', 'id': 'c-1', 'more': true}),
        conversation,
      );
    });

    test('what is not a whole conversation is none — the bare id of the previous protocol too', () {
      final List<Object?> unreadable = <Object?>[
        null,
        'c-1',
        7,
        <String, Object?>{},
        <String, Object?>{'id': 'c-1'},
        <String, Object?>{'engine': 'engine-a'},
        <String, Object?>{'engine': '', 'id': 'c-1'},
        <String, Object?>{'engine': 'engine-a', 'id': ''},
        <String, Object?>{'engine': 1, 'id': 'c-1'},
        <String, Object?>{'engine': 'engine-a', 'id': 2},
      ];

      for (final Object? value in unreadable) {
        expect(conversationKeyFrom(value), isNull, reason: '$value');
      }
    });
  });

  test('writes a conversation as the contract does', () {
    expect(conversationWire(conversation), <String, Object?>{'engine': 'engine-a', 'id': 'c-1'});
    expect(conversationKeyFrom(conversationWire(conversation)), conversation);
  });

  group('the path of a conversation', () {
    test('S-39 · names the engine and the id, each a segment of its own', () {
      expect(transcriptPathOf(conversation), '/transcripts/engine-a/c-1');
      expect(
        transcriptPathOf(conversation, const <String>['tools', 't1', 'result']),
        '/transcripts/engine-a/c-1/tools/t1/result',
      );
    });

    test('escapes what would split a segment', () {
      expect(
        transcriptPathOf(const ConversationKey(engine: 'e/1', id: 'c 1'), const <String>['x/y']),
        '/transcripts/e%2F1/c%201/x%2Fy',
      );
    });
  });
}
