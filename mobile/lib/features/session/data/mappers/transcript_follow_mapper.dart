/// Reads the frames of a followed conversation as [FollowUpdate]s (plan 22, B-24).
///
/// The only file that knows both the `transcript.*` frames and the follow updates. It reads them by
/// the generated types of the contract (`protocol.g.dart`) — after checking the shape first: the
/// generated readers assert their required fields, which is right for a frame this app built and
/// wrong for one that arrived from the network. The events go through [historyEventFrom], the reader
/// of a page of the history, because they **are** entries of the history (05 §Acompanhar).
library;

import 'package:remote_claude/core/network/contracts/protocol.g.dart';
import 'package:remote_claude/core/network/failure_mapper.dart';
import 'package:remote_claude/features/session/data/mappers/history_mapper.dart';
import 'package:remote_claude/features/session/data/mappers/session_event_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';
import 'package:remote_claude/features/session/domain/entities/transcript_follow.dart';

/// The type prefix of every frame of a followed conversation.
const String transcriptStreamPrefix = 'transcript.';

/// The follow update [frame] carries, or `null` when it carries none this build can read.
///
/// An `error` that answers a command becomes a [FollowRefused] whatever command it answers: the
/// screen that followed keeps only the one that names its own `transcript.follow`.
FollowUpdate? followUpdateFrom(Envelope frame) {
  final Map<String, Object?> payload = frame.payload ?? const <String, Object?>{};
  final String? commandId = frame.correlationId;
  final int? seq = frame.seq;

  return switch (frame.type) {
    transcriptFollowingType when commandId != null => _started(payload, commandId),
    transcriptAppendedType when seq != null => _appended(payload, seq),
    transcriptResetType when seq != null => _reset(payload, seq),
    errorType when commandId != null => FollowRefused(
      commandId: commandId,
      failure: failureFromEnvelope(<String, Object?>{'error': payload}, frame.traceId ?? frame.id),
    ),
    _ => null,
  };
}

FollowUpdate? _started(Map<String, Object?> payload, String commandId) {
  if (!_texts(payload, const <String>['followId', 'conversationId', 'activity'])) {
    return null;
  }

  final TranscriptFollowingPayload ack = TranscriptFollowingPayload.fromJson(payload);

  return FollowStarted(
    commandId: commandId,
    followId: ack.followId,
    conversationId: ack.conversationId,
    activity: activityFrom(ack.activity),
  );
}

FollowUpdate? _appended(Map<String, Object?> payload, int seq) {
  final Object? lastMessageId = payload['lastMessageId'];

  if (!_texts(payload, const <String>['followId', 'conversationId', 'activity']) ||
      payload['working'] is! bool ||
      !_entries(payload['events']) ||
      (lastMessageId != null && lastMessageId is! String)) {
    return null;
  }

  final TranscriptAppendedPayload appended = TranscriptAppendedPayload.fromJson(payload);

  return FollowAppended(
    followId: appended.followId,
    conversationId: appended.conversationId,
    seq: seq,
    // The same reader as a page: an entry this build cannot read costs that entry, not the frame.
    events: appended.events
        .map((TranscriptAppendedPayloadEventsItem item) => historyEventFrom(item.toJson()))
        .whereType<SessionEvent>()
        .toList(growable: false),
    lastMessageId: appended.lastMessageId,
    activity: activityFrom(appended.activity),
    working: appended.working,
  );
}

FollowUpdate? _reset(Map<String, Object?> payload, int seq) {
  if (!_texts(payload, const <String>['followId', 'conversationId', 'reason'])) {
    return null;
  }

  final TranscriptResetPayload reset = TranscriptResetPayload.fromJson(payload);

  return FollowReset(
    followId: reset.followId,
    conversationId: reset.conversationId,
    seq: seq,
    // A reason added after this build shipped still ends the subscription: read it again, as for a
    // chain rewritten, and the page says what is there.
    reason: reset.reason == 'gone' ? FollowResetReason.gone : FollowResetReason.rewritten,
  );
}

/// What a log may say about [update]: ids, counts and states — never the content of an entry.
Map<String, Object?> followLogFieldsOf(FollowUpdate update) => switch (update) {
  FollowStarted() => <String, Object?>{
    'type': transcriptFollowingType,
    'followId': update.followId,
    'conversationId': update.conversationId,
    'activity': update.activity?.name,
  },
  FollowAppended() => <String, Object?>{
    'type': transcriptAppendedType,
    'followId': update.followId,
    'seq': update.seq,
    'events': update.events.length,
    'lastMessageId': update.lastMessageId,
    'activity': update.activity?.name,
    'working': update.working,
  },
  FollowReset() => <String, Object?>{
    'type': transcriptResetType,
    'followId': update.followId,
    'seq': update.seq,
    'reason': update.reason.name,
  },
  FollowRefused() => <String, Object?>{
    'type': errorType,
    'commandId': update.commandId,
    'code': update.failure.code,
  },
};

/// Whether every one of [keys] is a string in [payload].
bool _texts(Map<String, Object?> payload, List<String> keys) =>
    keys.every((String key) => payload[key] is String);

/// Whether [events] is a list of `{ type, payload }`, as the generated reader expects it.
bool _entries(Object? events) =>
    events is List<Object?> &&
    events.every(
      (Object? entry) =>
          entry is Map<String, Object?> &&
          entry['type'] is String &&
          entry['payload'] is Map<String, Object?>,
    );
