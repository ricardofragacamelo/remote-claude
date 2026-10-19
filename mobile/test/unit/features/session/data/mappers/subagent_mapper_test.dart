/// `GET /transcripts/:engine/:id/subagents/:toolUseId/messages` — a subagent's own page, read the
/// same way the main transcript's is (plan 26, B-20).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/data/mappers/subagent_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';

void main() {
  test('reads the events and the next cursor', () {
    final body = <String, Object?>{
      'events': <Object?>[
        <String, Object?>{
          'type': 'message.completed',
          'payload': <String, Object?>{
            'messageId': 'm1',
            'role': 'assistant',
            'content': <Object?>[
              <String, Object?>{'type': 'text', 'text': 'found it'},
            ],
          },
        },
      ],
      'nextCursor': 'c1',
    };

    final page = subagentPageFrom(body);

    expect(page, isNotNull);
    expect(page!.events, hasLength(1));
    expect((page.events.single as MessageFinished).text, 'found it');
    expect(page.nextCursor, 'c1');
  });

  test('an event this build cannot read is dropped, not the whole page', () {
    final body = <String, Object?>{
      'events': <Object?>[
        <String, Object?>{'type': 'session.somethingNew', 'payload': <String, Object?>{}},
        <String, Object?>{
          'type': 'message.completed',
          'payload': <String, Object?>{
            'messageId': 'm1',
            'role': 'assistant',
            'content': <Object?>[],
          },
        },
      ],
    };

    final page = subagentPageFrom(body);

    expect(page!.events, hasLength(1));
    expect(page.nextCursor, isNull);
  });

  group('err · a body this build cannot read', () {
    test('not a map at all', () {
      expect(subagentPageFrom('nope'), isNull);
      expect(subagentPageFrom(null), isNull);
    });

    test('missing the events field', () {
      expect(subagentPageFrom(<String, Object?>{'nextCursor': null}), isNull);
    });
  });

  test('no events at all is a page with nothing, not unreadable', () {
    final page = subagentPageFrom(<String, Object?>{'events': <Object?>[]});

    expect(page!.events, isEmpty);
  });
}
