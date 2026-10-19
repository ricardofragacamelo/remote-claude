/// One page of a subagent's own messages, as the domain has it (plan 26, B-20).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';
import 'package:remote_claude/features/session/domain/entities/subagent_page.dart';

void main() {
  test('a page compares by its events and its next cursor', () {
    const List<SessionEvent> events = <SessionEvent>[
      MessageFinished(1, messageId: 'm1', isFromUser: false),
    ];

    expect(
      const SubagentPage(events: events, nextCursor: 'c1'),
      const SubagentPage(events: events, nextCursor: 'c1'),
    );
    expect(
      const SubagentPage(events: events, nextCursor: 'c1'),
      isNot(const SubagentPage(events: events)),
    );
  });
}
