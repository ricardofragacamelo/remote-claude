/// A conversation on the wire — the contract's `ConversationRef`, `{ engine, id }` — and back.
///
/// The one place that knows both spellings, shared by every edge that names a conversation: the
/// socket's acks and events, the routes of the history and the listing of a folder (plan 28, B-13).
library;

import 'package:remote_claude/core/conversation/conversation_key.dart';
import 'package:remote_claude/core/network/contracts/protocol.g.dart';

/// The conversation [value] names, or `null` when it is not a `{ engine, id }` of two non-empty
/// strings.
///
/// Checked before it is read: the generated reader asserts its fields, which is right for a frame
/// this app built and wrong for one that arrived from the network.
ConversationKey? conversationKeyFrom(Object? value) {
  if (value is! Map<String, Object?>) {
    return null;
  }

  final Object? engine = value['engine'];
  final Object? id = value['id'];

  if (engine is! String || engine.isEmpty || id is! String || id.isEmpty) {
    return null;
  }

  final ConversationRef ref = ConversationRef.fromJson(value);

  return ConversationKey(engine: ref.engine, id: ref.id);
}

/// [conversation] as the contract writes it.
Map<String, Object?> conversationWire(ConversationKey conversation) =>
    ConversationRef(engine: conversation.engine, id: conversation.id).toJson();

/// The path of [conversation] under `/transcripts`, every part a segment of its own — escaped, so
/// a character that would split it cannot: `/transcripts/:engine/:id`, then [rest].
String transcriptPathOf(ConversationKey conversation, [List<String> rest = const <String>[]]) =>
    <String>[
      '/transcripts',
      for (final String part in <String>[conversation.engine, conversation.id, ...rest])
        Uri.encodeComponent(part),
    ].join('/');
