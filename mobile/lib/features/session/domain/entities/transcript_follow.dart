/// Following a conversation of the history that this backend does not run (plan 22, F4).
///
/// Pure Dart. What arrives for a followed conversation has the shape of the history — the same
/// [SessionEvent]s a page carries, folded by the same [Conversation] — so no third shape is born
/// (docs/architecture/shared/05-websocket-protocol.md#acompanhar-um-transcript--transcript).
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';

/// What a conversation is doing now, by the rule of the listing.
///
/// `activeElsewhere` is an estimate — something wrote to it a moment ago —, never a fact about which
/// client has it open.
enum ConversationActivity {
  /// A live session of this backend holds it.
  liveHere,

  /// Something else — the editor or a terminal — wrote it a moment ago.
  activeElsewhere,

  /// Nothing wrote it lately.
  idle,
}

/// Why a subscription ended without being asked to.
enum FollowResetReason {
  /// The entry the client had is no longer in the chain: a rewind, a compaction or a fork rebuilt it.
  rewritten,

  /// The store no longer has the conversation.
  gone,
}

/// Something that happened to the following of a conversation.
///
/// Sealed so a `switch` over it is exhaustive.
sealed class FollowUpdate extends Equatable {
  const FollowUpdate();
}

/// The server took a `transcript.follow`: the subscription exists, named [followId].
final class FollowStarted extends FollowUpdate {
  const FollowStarted({
    required this.commandId,
    required this.followId,
    required this.conversationId,
    this.activity,
  });

  /// The id the `transcript.follow` left with — what tells **this** screen's follow from another's.
  final String commandId;

  /// The subscription. Every frame of it carries this id.
  final String followId;

  final String conversationId;

  /// What the conversation is doing now; `null` for a value this build does not know.
  final ConversationActivity? activity;

  @override
  List<Object?> get props => <Object?>[commandId, followId, conversationId, activity];
}

/// What a followed conversation gained since the last frame of its subscription.
final class FollowAppended extends FollowUpdate {
  const FollowAppended({
    required this.followId,
    required this.conversationId,
    required this.seq,
    required this.working,
    this.events = const <SessionEvent>[],
    this.lastMessageId,
    this.activity,
  });

  final String followId;
  final String conversationId;

  /// The subscription's own numbering, from one. A hole in it is a frame lost.
  final int seq;

  /// The new entries, oldest first, in the order of the SDK's chain. Empty when only [activity] or
  /// [working] changed.
  final List<SessionEvent> events;

  /// The last entry of the conversation now — what a later follow starts after.
  final String? lastMessageId;

  /// What the conversation is doing now; `null` for a value this build does not know.
  final ConversationActivity? activity;

  /// Whether Claude **seems** to be working on it in another client — an inference from the
  /// transcript, which records no state of the turn (plan 22, D-12).
  final bool working;

  @override
  List<Object?> get props => <Object?>[
    followId,
    conversationId,
    seq,
    events,
    lastMessageId,
    activity,
    working,
  ];
}

/// The subscription cannot go on from where the client is, and has ended.
final class FollowReset extends FollowUpdate {
  const FollowReset({
    required this.followId,
    required this.conversationId,
    required this.seq,
    required this.reason,
  });

  final String followId;
  final String conversationId;
  final int seq;
  final FollowResetReason reason;

  @override
  List<Object?> get props => <Object?>[followId, conversationId, seq, reason];
}

/// The server refused a `transcript.follow` — or any other command; [commandId] says whose.
final class FollowRefused extends FollowUpdate {
  const FollowRefused({required this.commandId, required this.failure});

  final String commandId;

  /// Why: `TRANSCRIPT_FOLLOW_LIMIT` past a ceiling, `TRANSCRIPT_FOLLOW_LIVE_HERE`, `NOT_FOUND`.
  final Failure failure;

  @override
  List<Object?> get props => <Object?>[commandId, failure];
}
