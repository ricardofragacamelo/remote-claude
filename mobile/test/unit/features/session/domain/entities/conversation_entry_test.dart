/// The entries a conversation is made of.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import '../../../../../support/builders/tools.dart';

void main() {
  group('StreamMessage', () {
    test('its text is the finished blocks and the one arriving, in order', () {
      const StreamMessage message = StreamMessage(
        messageId: 'm',
        blocks: <MessageBlock>[TextBlock('one '), TextBlock('two ')],
        streaming: 'thr',
      );

      expect(message.text, 'one two thr');
      expect(message.isComplete, isFalse);
      expect(const StreamMessage(messageId: 'm').isComplete, isTrue);
    });

    test('a copy keeps who wrote it, and can clear what was arriving', () {
      const StreamMessage message = StreamMessage(messageId: 'm', streaming: 'a', isFromUser: true);

      final StreamMessage after = message.copyWith(
        blocks: <MessageBlock>[const TextBlock('ab')],
        streaming: () => null,
      );

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
    final ToolExecution tool = ToolExecution(toolUseId: 't', call: shellCall('ls -la'));

    final ToolExecution after = tool.copyWith(
      status: ToolStatus.succeeded,
      elapsed: '3s',
      summary: 'done',
    );

    expect(tool.entryId, 'tool:t');
    expect(after.call.rawInput['command'], 'ls -la');
    expect(after.status, ToolStatus.succeeded);
    expect(after.elapsed, '3s');
    expect(after.summary, 'done');
    expect(tool, tool.copyWith());
    expect(tool, isNot(tool.copyWith(elapsed: '9s')));
  });

  test('plan 26, B-18 · isSubagent is parentToolUseId, read as a question', () {
    final ToolExecution main = ToolExecution(toolUseId: 't', call: shellCall('ls'));
    final ToolExecution nested = ToolExecution(
      toolUseId: 't2',
      call: shellCall('ls'),
      parentToolUseId: 'agent-1',
    );

    expect(main.isSubagent, isFalse);
    expect(nested.isSubagent, isTrue);
    // A copy keeps the same owner — a tool never changes whose it is.
    expect(nested.copyWith(status: ToolStatus.succeeded).parentToolUseId, 'agent-1');
  });

  test('a turn is known by its id, and a compaction by where it happened', () {
    expect(const TurnSummary(turnId: 't', costUsd: '0', durationMs: 0).entryId, 'turn:t');

    const CompactionLine manual = CompactionLine(seq: 4, trigger: 'manual', preTokens: 10);
    expect(manual.entryId, 'compaction:4');
    expect(manual.isManual, isTrue);
    expect(const CompactionLine(seq: 5, trigger: 'auto').isManual, isFalse);
    expect(manual, const CompactionLine(seq: 4, trigger: 'manual', preTokens: 10));
  });

  test('a compaction keeps its place when its summary arrives (plan 27, F6 · B-21)', () {
    const CompactionLine manual = CompactionLine(
      seq: 4,
      trigger: 'manual',
      preTokens: 10,
      compactionId: 'c-1',
    );

    final CompactionLine summarised = manual.withSummary('what happened');

    expect(summarised.entryId, manual.entryId);
    expect(summarised.summary, 'what happened');
    expect(
      summarised,
      const CompactionLine(
        seq: 4,
        trigger: 'manual',
        preTokens: 10,
        compactionId: 'c-1',
        summary: 'what happened',
      ),
    );
    expect(summarised, isNot(manual));
  });

  test('an injected line is known by its message, not its kind (plan 27, F6 · B-21)', () {
    const InjectedLine instructions = InjectedLine(messageId: 'm-1', injectedKind: 'instructions');
    const InjectedLine other = InjectedLine(
      messageId: 'm-1',
      injectedKind: 'other',
      name: 'skill',
      parentToolUseId: 'agent-1',
    );

    expect(instructions.entryId, 'injected:m-1');
    expect(other.entryId, instructions.entryId);
    expect(instructions, isNot(other));
    expect(
      other,
      const InjectedLine(
        messageId: 'm-1',
        injectedKind: 'other',
        name: 'skill',
        parentToolUseId: 'agent-1',
      ),
    );
  });

  test(
    'a notice is known by its noticeId, or by its own synthesised id (plan 27, F6 · B-19, B-20)',
    () {
      const NoticeLine fromBackend = NoticeLine(
        noticeId: 'n-1',
        kind: 'commandOutput',
        level: NoticeLevel.info,
      );
      const NoticeLine synthesised = NoticeLine(
        id: 'generic:unknownEvent:session.weird',
        kind: '',
        reason: GenericReason.unknownEvent,
        detail: 'session.weird',
        level: NoticeLevel.notice,
      );

      expect(fromBackend.entryId, 'notice:n-1');
      expect(synthesised.entryId, 'generic:unknownEvent:session.weird');
      expect(
        fromBackend,
        const NoticeLine(noticeId: 'n-1', kind: 'commandOutput', level: NoticeLevel.info),
      );
      expect(fromBackend, isNot(synthesised));

      final NoticeLine repeated = synthesised.repeated();
      expect(repeated.count, 2);
      expect(repeated.entryId, synthesised.entryId);
      expect(repeated, isNot(synthesised));
    },
  );

  test('a tool attachment compares by its own fields (plan 27, F6 · B-22)', () {
    const ImageAttachment image = ImageAttachment(blockId: 'b-1', mediaType: 'image/png', size: 10);
    const LinkAttachment link = LinkAttachment(uri: 'https://example.com', title: 't');
    const UnknownAttachment unknown = UnknownAttachment(type: 'future');

    expect(image, const ImageAttachment(blockId: 'b-1', mediaType: 'image/png', size: 10));
    expect(image, isNot(const ImageAttachment(blockId: 'b-2', mediaType: 'image/png', size: 10)));
    expect(link, const LinkAttachment(uri: 'https://example.com', title: 't'));
    expect(link, isNot(const LinkAttachment(uri: 'https://example.com', title: 'other')));
    expect(unknown, const UnknownAttachment(type: 'future'));
    expect(unknown, isNot(const UnknownAttachment(type: 'other')));
    expect(image, isNot(unknown));
  });

  test('a queued prompt compares by value', () {
    expect(
      const QueuedPrompt(queueId: 'q', promptedBy: 'web', preview: 'p'),
      const QueuedPrompt(queueId: 'q', promptedBy: 'web', preview: 'p'),
    );
  });
}
