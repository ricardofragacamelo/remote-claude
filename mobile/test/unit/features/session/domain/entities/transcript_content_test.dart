/// What a conversation's timeline only marks, as values — plan 22, B-32, B-33.
library;

import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/entities/transcript_content.dart';

void main() {
  test('two outputs are the same output when every field is', () {
    expect(const ToolOutput(text: 'a', cutAt: 1), const ToolOutput(text: 'a', cutAt: 1));
    expect(const ToolOutput(text: 'a'), isNot(const ToolOutput(text: 'a', truncated: true)));
  });

  test('two images are the same image when their bytes and type are', () {
    final Uint8List bytes = Uint8List.fromList(<int>[1, 2]);

    expect(
      PromptImageBytes(bytes: bytes, mediaType: 'image/png'),
      PromptImageBytes(bytes: bytes, mediaType: 'image/png'),
    );
    expect(
      PromptImageBytes(bytes: bytes, mediaType: 'image/png'),
      isNot(PromptImageBytes(bytes: bytes, mediaType: 'image/gif')),
    );
  });
}
