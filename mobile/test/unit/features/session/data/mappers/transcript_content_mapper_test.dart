/// Reading the answer of the route of a tool's whole output — plan 22, B-32.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/data/mappers/transcript_content_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/transcript_content.dart';

void main() {
  test('reads the output, whole', () {
    expect(
      toolOutputFrom(<String, Object?>{'text': 'two files', 'truncated': false, 'bytes': 9}),
      const ToolOutput(text: 'two files', bytes: 9),
    );
  });

  test('S-114 · reads a cut output: how large it was, and where it was cut', () {
    expect(
      toolOutputFrom(<String, Object?>{
        'text': 'startend',
        'truncated': true,
        'bytes': 400000,
        'cutAt': 5,
      }),
      const ToolOutput(text: 'startend', truncated: true, bytes: 400000, cutAt: 5),
    );
  });

  test('a cut outside the text is not marked, and at its very end it is', () {
    expect(toolOutputFrom(<String, Object?>{'text': 'abc', 'cutAt': 4}).cutAt, isNull);
    expect(toolOutputFrom(<String, Object?>{'text': 'abc', 'cutAt': 3}).cutAt, 3);
    expect(toolOutputFrom(<String, Object?>{'text': 'abc', 'cutAt': -1}).cutAt, isNull);
  });

  test('a field that is not what it says is not there', () {
    expect(
      toolOutputFrom(<String, Object?>{'text': 7, 'truncated': 'yes', 'bytes': 1.5, 'cutAt': '2'}),
      const ToolOutput(text: ''),
    );
  });

  test('without a size, the size is the text it has', () {
    expect(toolOutputFrom(<String, Object?>{'text': 'four'}).bytes, 4);
  });

  test('a body that is not an object is an empty output, not a crash', () {
    expect(toolOutputFrom(null), const ToolOutput(text: ''));
    expect(toolOutputFrom(<Object?>['text']), const ToolOutput(text: ''));
  });
}
