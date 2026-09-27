/// Listing the conversations of one workspace.
library;

import 'package:remote_claude/features/transcript/domain/entities/conversation_summary.dart';
import 'package:remote_claude/features/transcript/domain/repositories/transcript_repository.dart';

/// A page of the conversations of a workspace.
class ListConversations {
  const ListConversations(this._transcripts);

  final TranscriptRepository _transcripts;

  /// The first page of [workspacePath], or the one [cursor] names.
  Future<ConversationList> call(String workspacePath, {String? cursor}) =>
      _transcripts.list(workspacePath, cursor: cursor);
}
