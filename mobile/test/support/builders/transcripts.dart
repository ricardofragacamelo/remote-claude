/// Conversations of the history, built for a test.
library;

import 'package:remote_claude/features/transcript/transcript.dart';

/// One row of `GET /transcripts`, complete, with [overrides] applied on top.
///
/// A key overridden with `null` is **removed**, so a test can say "this row has no branch" without
/// restating every other field.
Map<String, Object?> conversationRow([Map<String, Object?> overrides = const <String, Object?>{}]) {
  final Map<String, Object?> row = <String, Object?>{
    'sessionId': 'conv-1',
    'summary': 'Fix the build',
    'origin': 'ours',
    'cwd': '/home/someone/project',
    'gitBranch': 'main',
    'createdAt': '2026-09-20T10:00:00.000Z',
    'lastModified': '2026-09-24T18:30:00.000Z',
    ...overrides,
  };

  row.removeWhere((String key, Object? value) => value == null);
  return row;
}

/// One conversation as the list has it.
ConversationSummary aConversation({
  String conversationId = 'conv-1',
  String summary = 'Fix the build',
  ConversationOrigin origin = ConversationOrigin.ours,
  String cwd = '/home/someone/project',
  String? gitBranch = 'main',
}) => ConversationSummary(
  conversationId: conversationId,
  summary: summary,
  origin: origin,
  cwd: cwd,
  gitBranch: gitBranch,
  createdAt: DateTime.utc(2026, 9, 20, 10),
  lastModified: DateTime.utc(2026, 9, 24, 18, 30),
);
