/// Where a conversation of Claude's store came from, as far as this product can prove it.
///
/// Pure Dart. The names are the wire's, on purpose: the backend says `ours` or `external`, and a
/// value this build does not know is read as nothing rather than guessed at.
library;

/// The origin of one conversation.
enum ConversationOrigin {
  /// Opened from this product, by the person reading.
  ours,

  /// Began anywhere else — the editor **or** the terminal. Deliberately not "the editor": nothing
  /// reports which one it was, and a label naming it would be the screen asserting what nobody
  /// knows ([04 · D-01](../../../../../../docs/plans/04-transcript-and-resume/decisions.md#d-01--o-que-aparece-de-fora)).
  ///
  /// It also decides how a resume runs: a conversation that is not ours is continued under a new
  /// id, so nothing is ever written into a transcript somebody else may have open (D-04). The
  /// history screen says so before anybody resumes it.
  external;

  /// The origin the wire names, or `null` when it names none this build knows.
  static ConversationOrigin? fromWire(Object? value) =>
      value is String ? ConversationOrigin.values.asNameMap()[value] : null;
}
