/// Reads the backend's listing of the history as entities.
///
/// This is the only file that knows both the wire and the entity. A DTO never leaves `data/`.
library;

import 'package:remote_claude/core/conversation/conversation_key.dart';
import 'package:remote_claude/core/network/conversation_wire.dart';
import 'package:remote_claude/features/transcript/domain/entities/conversation_origin.dart';
import 'package:remote_claude/features/transcript/domain/entities/conversation_summary.dart';

/// One conversation, or `null` when the entry is not one.
///
/// An entry the app cannot read is dropped rather than thrown over: one malformed row in a page of
/// twenty-five should cost the person that row, not the screen.
ConversationSummary? conversationFrom(Object? entry) {
  if (entry is! Map<String, Object?>) {
    return null;
  }

  // The conversation, never the bare `sessionId` the previous protocol listed beside it (plan 28,
  // D-08): an id alone does not say which engine keeps it.
  final ConversationKey? conversation = conversationKeyFrom(entry['conversation']);
  final Object? cwd = entry['cwd'];
  final ConversationOrigin? origin = ConversationOrigin.fromWire(entry['origin']);
  final DateTime? lastModified = _instant(entry['lastModified']);

  if (conversation == null || cwd is! String || origin == null || lastModified == null) {
    return null;
  }

  final Object? summary = entry['summary'];
  final Object? gitBranch = entry['gitBranch'];

  return ConversationSummary(
    conversation: conversation,
    summary: summary is String ? summary : '',
    origin: origin,
    cwd: cwd,
    gitBranch: gitBranch is String ? gitBranch : null,
    createdAt: _instant(entry['createdAt']),
    lastModified: lastModified,
  );
}

/// Every conversation of the page, in the order the backend gave them, and where the next starts.
ConversationList conversationListFrom(Object? payload) {
  if (payload is! Map<String, Object?>) {
    return const ConversationList();
  }

  final Object? sessions = payload['sessions'];
  final Object? nextCursor = payload['nextCursor'];

  return ConversationList(
    conversations: sessions is List<Object?>
        ? sessions.map(conversationFrom).whereType<ConversationSummary>().toList(growable: false)
        : const <ConversationSummary>[],
    nextCursor: nextCursor is String ? nextCursor : null,
  );
}

DateTime? _instant(Object? value) => value is String ? DateTime.tryParse(value)?.toUtc() : null;
