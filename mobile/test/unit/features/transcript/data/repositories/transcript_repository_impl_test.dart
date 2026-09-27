/// The transcript repository, and the use case over it.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/transcript/data/datasources/transcript_api_data_source.dart';
import 'package:remote_claude/features/transcript/data/repositories/transcript_repository_impl.dart';
import 'package:remote_claude/features/transcript/domain/usecases/list_conversations.dart';
import 'package:remote_claude/features/transcript/transcript.dart';

import '../../../../../support/builders/transcripts.dart';

/// Answers a fixed body, and keeps what it was asked.
class _Api implements TranscriptApiDataSource {
  final List<(String, String?)> asked = <(String, String?)>[];

  @override
  Future<Object?> list(String workspacePath, {String? cursor}) async {
    asked.add((workspacePath, cursor));
    return <String, Object?>{
      'sessions': <Object?>[conversationRow()],
      'nextCursor': 'next',
    };
  }
}

void main() {
  test('turns the wire into the page the screen works with', () async {
    final _Api api = _Api();

    final ConversationList page = await TranscriptRepositoryImpl(api).list('/p', cursor: 'c');

    expect(api.asked.single, ('/p', 'c'));
    expect(page.conversations.single, aConversation());
    expect(page.nextCursor, 'next');
  });

  test('the use case asks for the workspace and page it was given', () async {
    final _Api api = _Api();

    await ListConversations(TranscriptRepositoryImpl(api))('/p');

    expect(api.asked.single, ('/p', null));
  });

  test('two conversations with the same fields are the same conversation', () {
    expect(aConversation(), aConversation());
    expect(aConversation(), isNot(aConversation(origin: ConversationOrigin.external)));
    expect(const ConversationList(), const ConversationList());
  });
}
