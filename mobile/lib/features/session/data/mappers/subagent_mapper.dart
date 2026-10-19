/// Reads a page of `GET /transcripts/:engine/:id/subagents/:toolUseId/messages` as a
/// [SubagentPage].
///
/// Its events go through `historyEventFrom` — the mapper of the live frames — so a subagent read
/// from the history and one followed live cannot disagree about what a message is (plan 26, B-20).
library;

import 'package:remote_claude/features/session/data/mappers/session_event_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';
import 'package:remote_claude/features/session/domain/entities/subagent_page.dart';

/// The page in [body], or `null` when it is not one this build can read.
SubagentPage? subagentPageFrom(Object? body) {
  if (body is! Map<String, Object?>) {
    return null;
  }

  final Object? events = body['events'];

  if (events is! List<Object?>) {
    return null;
  }

  return SubagentPage(
    events: events.map(historyEventFrom).whereType<SessionEvent>().toList(growable: false),
    nextCursor: body['nextCursor'] is String ? body['nextCursor']! as String : null,
  );
}
