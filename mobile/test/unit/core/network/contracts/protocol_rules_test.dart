/// The rules the schema carries beyond "this field is required", as the Dart predicates generated
/// from it read them — the same `x-required-when` and the same bounds the TypeScript guards are
/// generated from (plan 08, B-01 and B-02).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/network/contracts/protocol.g.dart';

void main() {
  group('an attachment of a prompt', () {
    test('S-01 · each kind with what it needs holds', () {
      for (final Map<String, Object?> attachment in <Map<String, Object?>>[
        <String, Object?>{'kind': 'file', 'path': 'src/a.ts'},
        <String, Object?>{'kind': 'folder', 'path': 'src'},
        <String, Object?>{'kind': 'upload', 'attachmentId': 'att_1'},
        <String, Object?>{'kind': 'text', 'source': 'terminal', 'label': 'bash', 'content': 'ls'},
      ]) {
        expect(
          sessionPromptPayloadAttachmentsItemConditionalsHold(attachment),
          isTrue,
          reason: '$attachment',
        );
      }
    });

    test('S-02 · without a kind it is the file it always was, named by its path', () {
      expect(
        sessionPromptPayloadAttachmentsItemConditionalsHold(<String, Object?>{'path': 'a.md'}),
        isTrue,
      );
      expect(
        sessionPromptPayloadAttachmentsItemConditionalsHold(<String, Object?>{'mediaType': 'x'}),
        isFalse,
      );
    });

    test('S-03 · a kind without what it needs does not hold', () {
      for (final Map<String, Object?> attachment in <Map<String, Object?>>[
        <String, Object?>{'kind': 'file'},
        <String, Object?>{'kind': 'folder'},
        <String, Object?>{'kind': 'upload'},
        <String, Object?>{'kind': 'text', 'source': 'terminal', 'label': 'bash'},
      ]) {
        expect(
          sessionPromptPayloadAttachmentsItemConditionalsHold(attachment),
          isFalse,
          reason: '$attachment',
        );
      }
    });

    test('S-04 · a line is counted from one', () {
      expect(
        sessionPromptPayloadAttachmentsItemRangeLimitsHold(<String, Object?>{
          'startLine': 1,
          'endLine': 1,
        }),
        isTrue,
      );
      expect(
        sessionPromptPayloadAttachmentsItemRangeLimitsHold(<String, Object?>{
          'startLine': 0,
          'endLine': 3,
        }),
        isFalse,
      );
    });

    test('S-05 · at most twenty attachments', () {
      List<Object?> many(int count) =>
          List<Object?>.filled(count, <String, Object?>{'kind': 'file', 'path': 'a'});

      expect(sessionPromptPayloadLimitsHold(<String, Object?>{'attachments': many(20)}), isTrue);
      expect(sessionPromptPayloadLimitsHold(<String, Object?>{'attachments': many(21)}), isFalse);
    });

    test('S-06 · the text of a provider is bounded', () {
      Map<String, Object?> text(int length) => <String, Object?>{
        'kind': 'text',
        'content': 'x' * length,
      };

      expect(sessionPromptPayloadAttachmentsItemLimitsHold(text(16384)), isTrue);
      expect(sessionPromptPayloadAttachmentsItemLimitsHold(text(16385)), isFalse);
    });
  });

  test('S-08 · a fork point needs the conversation it belongs to', () {
    expect(
      sessionStartPayloadConditionalsHold(<String, Object?>{'workspacePath': '/w', 'forkAt': 'm'}),
      isFalse,
    );
    expect(
      sessionStartPayloadConditionalsHold(<String, Object?>{
        'workspacePath': '/w',
        'forkAt': 'm',
        'resumeSessionId': 'c',
      }),
      isTrue,
    );
    expect(sessionStartPayloadConditionalsHold(<String, Object?>{'workspacePath': '/w'}), isTrue);
  });
}
