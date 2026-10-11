/// A conversation is its engine and its id — never the id alone (plan 28, B-13).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/conversation/conversation_key.dart';

void main() {
  test('two keys of the same engine and id are the same conversation', () {
    expect(
      const ConversationKey(engine: 'engine-a', id: 'c-1'),
      const ConversationKey(engine: 'engine-a', id: 'c-1'),
    );
    expect(
      const ConversationKey(engine: 'engine-a', id: 'c-1').hashCode,
      const ConversationKey(engine: 'engine-a', id: 'c-1').hashCode,
    );
  });

  test('S-39 · the same id in another engine is another conversation', () {
    expect(
      const ConversationKey(engine: 'engine-a', id: 'c-1'),
      isNot(const ConversationKey(engine: 'engine-b', id: 'c-1')),
    );
    expect(
      const ConversationKey(engine: 'engine-a', id: 'c-1'),
      isNot(const ConversationKey(engine: 'engine-a', id: 'c-2')),
    );
  });

  test('it reads as its engine and its id, for a log line', () {
    expect(const ConversationKey(engine: 'engine-a', id: 'c-1').toString(), 'engine-a:c-1');
  });
}
