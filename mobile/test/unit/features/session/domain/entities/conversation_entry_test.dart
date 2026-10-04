/// The entries a conversation is made of.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';

void main() {
  group('StreamMessage', () {
    test('its text is the finished blocks and the one arriving, in order', () {
      const StreamMessage message = StreamMessage(
        messageId: 'm',
        blocks: <String>['one ', 'two '],
        streaming: 'thr',
      );

      expect(message.text, 'one two thr');
      expect(message.isComplete, isFalse);
      expect(const StreamMessage(messageId: 'm').isComplete, isTrue);
    });

    test('a copy keeps who wrote it, and can clear what was arriving', () {
      const StreamMessage message = StreamMessage(messageId: 'm', streaming: 'a', isFromUser: true);

      final StreamMessage after = message.copyWith(blocks: <String>['ab'], streaming: () => null);

      expect(after.isFromUser, isTrue);
      expect(after.text, 'ab');
      expect(after.isComplete, isTrue);
      expect(message.copyWith(), message);
    });

    test('compares by value and is known by its message', () {
      // ignore: prefer_const_constructors
      expect(StreamMessage(messageId: 'm'), StreamMessage(messageId: 'm'));
      expect(const StreamMessage(messageId: 'm').entryId, 'message:m');
    });
  });

  group('ThinkingEntry', () {
    const ThinkingEntry live = ThinkingEntry(
      messageId: 'm',
      index: 1,
      text: 'hm',
      startedAt: '2026-09-14T12:00:00.000Z',
    );

    test('continues with a fragment, and finishes with a text, a redaction and an instant', () {
      final ThinkingEntry continued = live.continued(', yes');

      expect(continued.text, 'hm, yes');
      expect(continued.isComplete, isFalse);

      final ThinkingEntry done = continued.finished(
        text: 'whole',
        isRedacted: true,
        at: '2026-09-14T12:00:07.500Z',
      );

      expect(done.text, 'whole');
      expect(done.isRedacted, isTrue);
      expect(done.isComplete, isTrue);
      expect(done.duration, const Duration(seconds: 7, milliseconds: 500));
    });

    test('finishing without a text or an instant keeps what it had', () {
      final ThinkingEntry done = live.finished();

      expect(done.text, 'hm');
      expect(done.isRedacted, isFalse);
      expect(done.endedAt, isNull);
      expect(done.duration, isNull);
    });

    test('S-61 · no honest duration without both instants, or with them out of order', () {
      expect(const ThinkingEntry(messageId: 'm', index: 0).duration, isNull);
      expect(
        const ThinkingEntry(
          messageId: 'm',
          index: 0,
          startedAt: '2026-09-14T12:00:05Z',
          endedAt: '2026-09-14T12:00:00Z',
        ).duration,
        isNull,
      );
      expect(
        const ThinkingEntry(
          messageId: 'm',
          index: 0,
          startedAt: 'not an instant',
          endedAt: '2026-09-14T12:00:00Z',
        ).duration,
        isNull,
      );
    });

    test('is known by its message and its place in it', () {
      expect(live.entryId, 'thinking:m:1');
      expect(live, live.continued(''));
    });
  });

  test('a tool is known by its invocation, and a copy keeps its exact input', () {
    const ToolExecution tool = ToolExecution(
      toolUseId: 't',
      toolName: 'Bash',
      input: <String, Object?>{'command': 'ls -la'},
    );

    final ToolExecution after = tool.copyWith(
      status: ToolStatus.succeeded,
      output: 'out',
      summary: 'done',
    );

    expect(tool.entryId, 'tool:t');
    expect(after.input['command'], 'ls -la');
    expect(after.status, ToolStatus.succeeded);
    expect(after.output, 'out');
    expect(after.summary, 'done');
    expect(tool, tool.copyWith());
    expect(tool, isNot(tool.copyWith(output: 'x')));
  });

  test('a turn is known by its id, and a compaction by where it happened', () {
    expect(const TurnSummary(turnId: 't', costUsd: '0', durationMs: 0).entryId, 'turn:t');

    const CompactionLine manual = CompactionLine(seq: 4, trigger: 'manual', preTokens: 10);
    expect(manual.entryId, 'compaction:4');
    expect(manual.isManual, isTrue);
    expect(const CompactionLine(seq: 5, trigger: 'auto').isManual, isFalse);
    expect(manual, const CompactionLine(seq: 4, trigger: 'manual', preTokens: 10));
  });

  test('a queued prompt compares by value', () {
    expect(
      const QueuedPrompt(queueId: 'q', promptedBy: 'web', preview: 'p'),
      const QueuedPrompt(queueId: 'q', promptedBy: 'web', preview: 'p'),
    );
  });
}
