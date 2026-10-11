/// Opening what a conversation's timeline only marks — plan 22, B-32, B-33.
library;

import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/conversation/conversation_key.dart';
import 'package:remote_claude/features/session/domain/entities/transcript_content.dart';
import 'package:remote_claude/features/session/domain/usecases/read_transcript_content.dart';

import '../../../../../support/builders/conversations.dart';
import '../../../../../support/fakes/fake_transcript_content_repository.dart';

void main() {
  test('reads the whole output of a tool of a conversation', () async {
    final FakeTranscriptContentRepository content = FakeTranscriptContentRepository()
      ..outputs['t1'] = const ToolOutput(text: 'done');

    expect(
      await ReadTranscriptContent(content).toolResult(conversationOf('c-1'), 't1'),
      const ToolOutput(text: 'done'),
    );
    expect(content.toolReads, <(ConversationKey, String)>[(conversationOf('c-1'), 't1')]);
  });

  test('reads the image of a prompt of a conversation', () async {
    final PromptImageBytes png = PromptImageBytes(bytes: Uint8List.fromList(<int>[1]));
    final FakeTranscriptContentRepository content = FakeTranscriptContentRepository()
      ..images['u1:1'] = png;

    expect(await ReadTranscriptContent(content).promptImage(conversationOf('c-1'), 'u1:1'), png);
    expect(content.imageReads, <(ConversationKey, String)>[(conversationOf('c-1'), 'u1:1')]);
  });
}
