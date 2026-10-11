/// Which conversation, in the words of the contract: the engine that keeps it and its id there.
///
/// Pure Dart, and in `core/` because three places name a conversation without knowing each other —
/// the session, the listing of the history and the address of a history screen. An id alone is not
/// a conversation: two engines may hand out the same one, so a conversation is keyed by both, always
/// (plan 28, B-13; docs/architecture/shared/12-engines.md).
library;

import 'package:equatable/equatable.dart';

/// One conversation of one engine.
class ConversationKey extends Equatable {
  const ConversationKey({required this.engine, required this.id});

  /// The engine — an `id` of `GET /engines`. Opaque: nothing decides by it.
  final String engine;

  /// The id of the conversation in the engine's store, in the engine's own form — opaque.
  final String id;

  @override
  List<Object?> get props => <Object?>[engine, id];

  @override
  String toString() => '$engine:$id';
}
