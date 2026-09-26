/// The values the conversation is made of.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/pong.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';

void main() {
  group('Conversation', () {
    test('starts empty, and stops being empty as soon as anything arrives', () {
      expect(const Conversation().isEmpty, isTrue);
      expect(
        const Conversation(
          messages: <StreamMessage>[StreamMessage(messageId: 'm', text: 'x')],
        ).isEmpty,
        isFalse,
      );
      expect(
        const Conversation(
          tools: <ToolExecution>[
            ToolExecution(toolUseId: 't', toolName: 'Bash', input: <String, Object?>{}),
          ],
        ).isEmpty,
        isFalse,
      );
    });

    test('a copy keeps what it was not asked to change', () {
      const Conversation before = Conversation(status: SessionStatus.running, lastSeq: 4);

      final Conversation after = before.copyWith(lastSeq: 5);

      expect(after.status, SessionStatus.running);
      expect(after.lastSeq, 5);
    });

    test('a copy can replace every field', () {
      final Conversation after = const Conversation().copyWith(
        status: SessionStatus.closed,
        lastSeq: 9,
        messages: <StreamMessage>[const StreamMessage(messageId: 'm', text: 'x')],
        tools: <ToolExecution>[
          const ToolExecution(toolUseId: 't', toolName: 'Read', input: <String, Object?>{}),
        ],
        lastTurn: const TurnSummary(turnId: 'turn', costUsd: '0.01', durationMs: 10),
        ending: const SessionEnding(reason: SessionCloseReason.completed, at: 'now'),
      );

      expect(after.status, SessionStatus.closed);
      expect(after.messages.single.messageId, 'm');
      expect(after.tools.single.toolName, 'Read');
      expect(after.lastTurn?.turnId, 'turn');
      expect(after.ending?.reason, SessionCloseReason.completed);
    });

    test('compares by value, so a rebuild is not a change', () {
      // Not `const` anywhere below: two identical constant expressions are one instance, and
      // identity would answer before the equality these tests are about.
      // ignore_for_file: prefer_const_constructors
      expect(Conversation(), Conversation());
      expect(Conversation(lastSeq: 1), isNot(Conversation(lastSeq: 2)));
    });
  });

  group('StreamMessage', () {
    test('a copy keeps who wrote it', () {
      const StreamMessage message = StreamMessage(messageId: 'm', text: 'a', isFromUser: true);

      final StreamMessage after = message.copyWith(text: 'ab', isComplete: true);

      expect(after.isFromUser, isTrue);
      expect(after.text, 'ab');
      expect(after.isComplete, isTrue);
    });

    test('a copy that changes nothing keeps everything', () {
      const StreamMessage message = StreamMessage(messageId: 'm', text: 'a', isComplete: true);

      expect(message.copyWith().text, 'a');
      expect(message.copyWith().isComplete, isTrue);
    });

    test('compares by value', () {
      expect(StreamMessage(messageId: 'm', text: 'a'), StreamMessage(messageId: 'm', text: 'a'));
      expect(
        StreamMessage(messageId: 'm', text: 'a'),
        isNot(StreamMessage(messageId: 'm', text: 'b')),
      );
    });
  });

  group('ToolExecution', () {
    test('a copy keeps the exact input it was given', () {
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

      expect(after.input['command'], 'ls -la');
      expect(after.status, ToolStatus.succeeded);
      expect(after.output, 'out');
      expect(after.summary, 'done');
    });

    test('compares by value', () {
      const ToolExecution one = ToolExecution(
        toolUseId: 't',
        toolName: 'Bash',
        input: <String, Object?>{},
      );

      expect(one, one.copyWith());
      expect(one, isNot(one.copyWith(output: 'x')));
    });
  });

  test('TurnSummary and SessionEnding compare by value', () {
    expect(
      TurnSummary(turnId: 't', costUsd: '0.01', durationMs: 1),
      TurnSummary(turnId: 't', costUsd: '0.01', durationMs: 1),
    );
    expect(
      TurnSummary(turnId: 't', costUsd: '0.01', durationMs: 1),
      isNot(TurnSummary(turnId: 't', costUsd: '0.02', durationMs: 1)),
    );
    expect(
      SessionEnding(reason: SessionCloseReason.failed, at: 'now'),
      SessionEnding(reason: SessionCloseReason.failed, at: 'now'),
    );
    expect(
      SessionEnding(reason: SessionCloseReason.failed, at: 'now'),
      isNot(SessionEnding(reason: SessionCloseReason.shutdown, at: 'now')),
    );
  });

  group('applying the stream', () {
    /// Every event in order, from nothing.
    Conversation applyAll(List<SessionEvent> events) =>
        events.fold(const Conversation(), (Conversation state, SessionEvent e) => state.apply(e));

    test('S-28 · discards an event whose seq was already applied', () {
      final Conversation after = applyAll(<SessionEvent>[
        MessageFragment(5, messageId: 'm1', delta: 'one'),
        MessageFragment(5, messageId: 'm1', delta: 'two'),
        MessageFragment(4, messageId: 'm1', delta: 'three'),
      ]);

      expect(after.messages.single.text, 'one');
      expect(after.lastSeq, 5);
    });

    test('S-30 · accumulates fragments, and the finished message replaces them', () {
      final Conversation streaming = applyAll(<SessionEvent>[
        MessageFragment(1, messageId: 'm1', delta: 'Hel'),
        MessageFragment(2, messageId: 'm1', delta: 'lo'),
      ]);

      expect(streaming.messages.single.text, 'Hello');
      expect(streaming.messages.single.isComplete, isFalse);

      final Conversation whole = streaming.apply(
        MessageFinished(3, messageId: 'm1', text: 'Hello, world', isFromUser: false),
      );

      expect(whole.messages.single.text, 'Hello, world');
      expect(whole.messages.single.isComplete, isTrue);
    });

    test('S-31 · two messages in flight do not mix their text', () {
      final Conversation after = applyAll(<SessionEvent>[
        MessageFragment(1, messageId: 'm1', delta: 'left '),
        MessageFragment(2, messageId: 'm2', delta: 'right '),
        MessageFragment(3, messageId: 'm1', delta: 'one'),
        MessageFragment(4, messageId: 'm2', delta: 'two'),
      ]);

      expect(after.messages.map((StreamMessage m) => m.text), <String>['left one', 'right two']);
    });

    test('a fragment arriving after the message finished is ignored', () {
      final Conversation after = applyAll(<SessionEvent>[
        MessageFinished(1, messageId: 'm1', text: 'whole', isFromUser: false),
        MessageFragment(2, messageId: 'm1', delta: ' and more'),
      ]);

      expect(after.messages.single.text, 'whole');
    });

    test('a message that finished without any fragment before it is still shown', () {
      final Conversation after = applyAll(<SessionEvent>[
        MessageFinished(1, messageId: 'm1', text: 'only', isFromUser: true),
      ]);

      expect(after.messages.single.text, 'only');
      expect(after.messages.single.isFromUser, isTrue);
    });

    test('S-77 · an event this build cannot read changes nothing but the resume point', () {
      final Conversation after = const Conversation(
        status: SessionStatus.idle,
      ).apply(const UnreadEvent(9));

      expect(after.status, SessionStatus.idle);
      expect(after.messages, isEmpty);
      expect(after.lastSeq, 9);
    });

    test('S-78 · a tool invoked again by the replay replaces rather than duplicates', () {
      final Conversation after = applyAll(<SessionEvent>[
        ToolInvoked(1, toolUseId: 't1', toolName: 'Bash', input: const <String, Object?>{}),
        ToolOutput(2, toolUseId: 't1', chunk: 'output'),
        ToolInvoked(3, toolUseId: 't1', toolName: 'Bash', input: const <String, Object?>{}),
      ]);

      expect(after.tools, hasLength(1));
      expect(after.tools.single.output, isEmpty);
    });

    test('collects a tool from its invocation to its outcome', () {
      final Conversation after = applyAll(<SessionEvent>[
        ToolInvoked(1, toolUseId: 't1', toolName: 'Bash', input: const <String, Object?>{}),
        ToolOutput(2, toolUseId: 't1', chunk: 'one '),
        ToolOutput(3, toolUseId: 't1', chunk: 'two'),
        const ToolFinished(4, toolUseId: 't1', status: ToolStatus.succeeded, summary: 'done'),
      ]);

      expect(after.tools.single.output, 'one two');
      expect(after.tools.single.status, ToolStatus.succeeded);
      expect(after.tools.single.summary, 'done');
    });

    test('anything about a tool nobody invoked changes nothing', () {
      final Conversation after = applyAll(<SessionEvent>[
        ToolOutput(1, toolUseId: 'unknown', chunk: 'lost'),
        const ToolFinished(2, toolUseId: 'unknown', status: ToolStatus.failed),
      ]);

      expect(after.tools, isEmpty);
    });

    test('a session opening means idle, without waiting for a status', () {
      expect(
        const Conversation().apply(const SessionOpened(1, 'session-1')).status,
        SessionStatus.idle,
      );
    });

    test('keeps the status, what the last turn cost, and how it ended', () {
      final Conversation after = applyAll(<SessionEvent>[
        const SessionStatusReported(1, SessionStatus.thinking),
        const TurnFinished(2, TurnSummary(turnId: 't', costUsd: '0.1', durationMs: 5)),
        const SessionFinished(3, SessionEnding(reason: SessionCloseReason.completed, at: 'now')),
      ]);

      expect(after.lastTurn?.costUsd, '0.1');
      expect(after.ending?.reason, SessionCloseReason.completed);
      expect(after.status, SessionStatus.closed);
    });

    test('a pong belongs to the round trip, not to the conversation', () {
      final Conversation after = const Conversation().apply(
        const PongArrived(
          1,
          Pong(
            seq: 1,
            sessionId: 'session-1',
            pingedAt: '2026-09-20T12:00:00.000Z',
            pingCount: 1,
            nonce: 'n-1',
          ),
        ),
      );

      expect(after.isEmpty, isTrue);
      expect(after.lastSeq, 1);
    });
  });
}
