/// Reads a page of the history endpoint as a [HistoryPage].
///
/// This is the only file that knows both the wire of `GET /transcripts/:sessionId/messages` and
/// the entity. Its events go through [historyEventFrom] — the mapper of the live frames — so the
/// history and the stream cannot disagree about what a message is.
///
/// Top-level and free of any state, because it runs in another isolate: a long transcript is
/// parsed off the UI thread (docs/architecture/mobile/03-state-and-data.md).
library;

import 'package:remote_claude/features/session/data/mappers/session_event_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/history_page.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';
import 'package:remote_claude/features/session/domain/entities/transcript_follow.dart';

/// The page in [body], or `null` when the body does not describe the conversation it is a page
/// of.
///
/// Without the conversation there is no workspace to resume in and no origin to warn about, so
/// such a body is not a page with nothing in it: it is an answer this build cannot read.
HistoryPage? historyPageFrom(Object? body) {
  if (body is! Map<String, Object?>) {
    return null;
  }

  final Object? conversation = body['session'];

  if (conversation is! Map<String, Object?>) {
    return null;
  }

  final Object? conversationId = conversation['sessionId'];
  final Object? cwd = conversation['cwd'];
  final Object? origin = conversation['origin'];

  // Both values are checked, not just one: an origin this build does not know is not "ours" by
  // default, and guessing wrong here is the difference between warning about a fork and not.
  if (conversationId is! String || cwd is! String || (origin != 'ours' && origin != 'external')) {
    return null;
  }

  return HistoryPage(
    conversationId: conversationId,
    workspacePath: cwd,
    beganElsewhere: origin == 'external',
    summary: _textOf(conversation['summary']) ?? '',
    events: _eventsOf(body['events']),
    nextCursor: _textOf(body['nextCursor']),
    // Both are absent from a server older than plan 22, and then nothing is followed from a point
    // and nothing is said about the activity — never a guess (S-89).
    activity: activityFrom(conversation['activity']),
    lastMessageId: _textOf(body['lastMessageId']),
  );
}

/// [value] when it is text, and `null` otherwise.
String? _textOf(Object? value) => value is String ? value : null;

/// The entries of a page this build can read, oldest first.
List<SessionEvent> _eventsOf(Object? events) => events is List<Object?>
    ? events.map(historyEventFrom).whereType<SessionEvent>().toList(growable: false)
    : const <SessionEvent>[];

/// The activity [value] names, or `null` when it names none this build knows.
///
/// Shared with the frames of a followed conversation, which say it with the same words.
ConversationActivity? activityFrom(Object? value) => switch (value) {
  'liveHere' => ConversationActivity.liveHere,
  'activeElsewhere' => ConversationActivity.activeElsewhere,
  'idle' => ConversationActivity.idle,
  _ => null,
};
