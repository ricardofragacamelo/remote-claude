/// The conversation as one ordered list of entries, and the three rules of the stream over it.
///
/// Plan 10, B-05: every scenario the two separate lists had (S-28…S-31, S-77, S-78, S-15, S-21 of
/// plans 01 and 04) is here, over the one list, beside the new ones (S-06…S-08). None left without
/// going somewhere (R-05).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/entities/checkpoint.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/pong.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';

/// Every event in order, from nothing.
Conversation applyAll(List<SessionEvent> events) =>
    events.fold(const Conversation(), (Conversation state, SessionEvent e) => state.apply(e));

/// The ids of the entries, in order — what the screen draws, top to bottom.
List<String> idsOf(Conversation conversation) =>
    conversation.entries.map((ConversationEntry entry) => entry.entryId).toList(growable: false);

void main() {
  group('Conversation', () {
    test('starts empty, and stops being empty as soon as anything arrives', () {
      expect(const Conversation().isEmpty, isTrue);
      expect(
        const Conversation(
          entries: <ConversationEntry>[
            StreamMessage(messageId: 'm', blocks: <String>['x']),
          ],
        ).isEmpty,
        isFalse,
      );
    });

    test('a copy keeps what it was not asked to change, and can replace every field', () {
      const Conversation before = Conversation(status: SessionStatus.running, lastSeq: 4);

      expect(before.copyWith(lastSeq: 5).status, SessionStatus.running);

      final Conversation after = before.copyWith(
        status: SessionStatus.closed,
        lastSeq: 9,
        entries: <ConversationEntry>[const StreamMessage(messageId: 'm')],
        queue: <QueuedPrompt>[const QueuedPrompt(queueId: 'q', promptedBy: 'web', preview: 'p')],
        facts: const SessionFacts(model: 'sonnet'),
        lastTurn: const TurnSummary(turnId: 'turn', costUsd: '0.01', durationMs: 10),
        ending: const SessionEnding(reason: SessionCloseReason.completed, at: 'now'),
      );

      expect(after.status, SessionStatus.closed);
      expect(after.lastSeq, 9);
      expect(after.messages.single.messageId, 'm');
      expect(after.queue.single.queueId, 'q');
      expect(after.facts.model, 'sonnet');
      expect(after.lastTurn?.turnId, 'turn');
      expect(after.ending?.reason, SessionCloseReason.completed);
    });

    test('compares by value, so a rebuild is not a change', () {
      // ignore_for_file: prefer_const_constructors
      expect(Conversation(), Conversation());
      expect(Conversation(lastSeq: 1), isNot(Conversation(lastSeq: 2)));
      expect(SessionFacts(model: 'a'), SessionFacts(model: 'a'));
    });

    test('a turn runs while the model thinks, a tool runs, or a question waits', () {
      for (final SessionStatus status in SessionStatus.values) {
        expect(
          Conversation(status: status).isTurnRunning,
          const <SessionStatus>{
            SessionStatus.thinking,
            SessionStatus.running,
            SessionStatus.waitingPermission,
          }.contains(status),
          reason: '$status',
        );
      }
    });

    test('TurnSummary and SessionEnding compare by value', () {
      expect(
        TurnSummary(turnId: 't', costUsd: '0.01', durationMs: 1),
        TurnSummary(turnId: 't', costUsd: '0.01', durationMs: 1),
      );
      expect(
        SessionEnding(reason: SessionCloseReason.failed, at: 'now'),
        isNot(SessionEnding(reason: SessionCloseReason.shutdown, at: 'now')),
      );
    });
  });

  group('the order of the conversation — S-06', () {
    test('a message, a tool and a message are three entries in the order of the seq', () {
      final Conversation after = applyAll(<SessionEvent>[
        const MessageFinished(1, messageId: 'm1', text: 'let me look', isFromUser: false),
        const ToolInvoked(2, toolUseId: 't1', toolName: 'Bash', input: <String, Object?>{}),
        const MessageFinished(3, messageId: 'm2', text: 'found it', isFromUser: false),
      ]);

      expect(idsOf(after), <String>['message:m1', 'tool:t1', 'message:m2']);
    });

    test('the end of each turn and a compaction are entries in their place', () {
      final Conversation after = applyAll(<SessionEvent>[
        const MessageFinished(1, messageId: 'm1', text: 'done', isFromUser: false),
        const TurnFinished(2, TurnSummary(turnId: 'turn-1', costUsd: '0.1', durationMs: 5)),
        const ContextCompacted(3, trigger: 'manual', preTokens: 9000),
        const MessageFinished(4, messageId: 'm2', text: 'again', isFromUser: false),
      ]);

      expect(idsOf(after), <String>['message:m1', 'turn:turn-1', 'compaction:3', 'message:m2']);
      expect(after.lastTurn?.turnId, 'turn-1');
      expect((after.entries[2] as CompactionLine).preTokens, 9000);
    });

    test('a turn delivered twice is one entry', () {
      const TurnSummary turn = TurnSummary(turnId: 'turn-1', costUsd: '0.1', durationMs: 5);
      final Conversation after = applyAll(<SessionEvent>[
        const TurnFinished(1, turn),
        const TurnFinished(2, turn),
      ]);

      expect(idsOf(after), <String>['turn:turn-1']);
    });
  });

  group('the three rules of the stream', () {
    test('S-07 · S-28 · discards an event whose seq was already applied', () {
      final Conversation after = applyAll(<SessionEvent>[
        const MessageFragment(5, messageId: 'm1', delta: 'one'),
        const MessageFragment(5, messageId: 'm1', delta: 'two'),
        const MessageFragment(4, messageId: 'm1', delta: 'three'),
      ]);

      expect(after.messages.single.text, 'one');
      expect(after.lastSeq, 5);
    });

    test('S-30 · accumulates fragments, and the finished block replaces them', () {
      final Conversation streaming = applyAll(<SessionEvent>[
        const MessageFragment(1, messageId: 'm1', delta: 'Hel'),
        const MessageFragment(2, messageId: 'm1', delta: 'lo'),
      ]);

      expect(streaming.messages.single.text, 'Hello');
      expect(streaming.messages.single.isComplete, isFalse);

      final Conversation whole = streaming.apply(
        const MessageFinished(3, messageId: 'm1', text: 'Hello, world', isFromUser: false),
      );

      expect(whole.messages.single.text, 'Hello, world');
      expect(whole.messages.single.isComplete, isTrue);
    });

    test('S-31 · two messages in flight do not mix their text', () {
      final Conversation after = applyAll(<SessionEvent>[
        const MessageFragment(1, messageId: 'm1', delta: 'left '),
        const MessageFragment(2, messageId: 'm2', delta: 'right '),
        const MessageFragment(3, messageId: 'm1', delta: 'one'),
        const MessageFragment(4, messageId: 'm2', delta: 'two'),
      ]);

      expect(after.messages.map((StreamMessage m) => m.text), <String>['left one', 'right two']);
    });

    test('a fragment after a block finished starts the next block of the same message', () {
      final Conversation after = applyAll(<SessionEvent>[
        const MessageFinished(1, messageId: 'm1', text: 'first. ', isFromUser: false),
        const MessageFragment(2, messageId: 'm1', delta: 'second'),
      ]);

      expect(after.messages.single.text, 'first. second');
      expect(after.messages.single.isComplete, isFalse);
    });

    test('a block that calls a tool adds nothing, and never erases the answer before it', () {
      final Conversation after = applyAll(<SessionEvent>[
        const MessageFinished(1, messageId: 'm1', text: 'let me run it', isFromUser: false),
        const MessageFinished(2, messageId: 'm1', text: '', isFromUser: false),
      ]);

      expect(after.messages.single.text, 'let me run it');
    });

    test('a block with no text for a message nothing announced opens no empty message', () {
      final Conversation after = const Conversation().apply(
        const MessageFinished(1, messageId: 'm1', text: '', isFromUser: false),
      );

      expect(after.isEmpty, isTrue);
    });

    test('a block finished twice under one message is added once', () {
      final Conversation after = applyAll(<SessionEvent>[
        const MessageFinished(1, messageId: 'm1', text: 'same', isFromUser: false),
        const MessageFinished(2, messageId: 'm1', text: 'same', isFromUser: false),
      ]);

      expect(after.messages.single.blocks, <String>['same']);
    });

    test('a message that finished without any fragment before it is still shown', () {
      final Conversation after = const Conversation().apply(
        const MessageFinished(1, messageId: 'm1', text: 'only', isFromUser: true),
      );

      expect(after.messages.single.text, 'only');
      expect(after.messages.single.isFromUser, isTrue);
    });

    test('S-77 · an event this build cannot read changes nothing but the resume point', () {
      final Conversation after = const Conversation(
        status: SessionStatus.idle,
      ).apply(const UnreadEvent(9));

      expect(after.status, SessionStatus.idle);
      expect(after.isEmpty, isTrue);
      expect(after.lastSeq, 9);
    });

    test('S-78 · a tool invoked again by the replay starts over, in its place', () {
      final Conversation after = applyAll(<SessionEvent>[
        const ToolInvoked(1, toolUseId: 't1', toolName: 'Bash', input: <String, Object?>{}),
        const ToolOutput(2, toolUseId: 't1', chunk: 'output'),
        const MessageFinished(3, messageId: 'm1', text: 'meanwhile', isFromUser: false),
        const ToolInvoked(4, toolUseId: 't1', toolName: 'Bash', input: <String, Object?>{}),
      ]);

      expect(idsOf(after), <String>['tool:t1', 'message:m1']);
      expect(after.tools.single.output, isEmpty);
    });

    test('collects a tool from its invocation to its outcome', () {
      final Conversation after = applyAll(<SessionEvent>[
        const ToolInvoked(1, toolUseId: 't1', toolName: 'Bash', input: <String, Object?>{}),
        const ToolOutput(2, toolUseId: 't1', chunk: 'one '),
        const ToolOutput(3, toolUseId: 't1', chunk: 'two'),
        const ToolFinished(4, toolUseId: 't1', status: ToolStatus.succeeded, summary: 'done'),
      ]);

      expect(after.tools.single.output, 'one two');
      expect(after.tools.single.status, ToolStatus.succeeded);
      expect(after.tools.single.summary, 'done');
    });

    test('S-103 · keeps on the tool the question its end carried', () {
      const Map<String, Object?> question = <String, Object?>{'outcome': 'declined'};
      final Conversation after = applyAll(<SessionEvent>[
        const ToolInvoked(
          1,
          toolUseId: 't1',
          toolName: 'AskUserQuestion',
          input: <String, Object?>{},
        ),
        const ToolFinished(2, toolUseId: 't1', status: ToolStatus.denied, question: question),
      ]);

      expect(after.tools.single.question, question);
    });

    test('anything about a tool nobody invoked changes nothing', () {
      final Conversation after = applyAll(<SessionEvent>[
        const ToolOutput(1, toolUseId: 'unknown', chunk: 'lost'),
        const ToolFinished(2, toolUseId: 'unknown', status: ToolStatus.failed),
      ]);

      expect(after.isEmpty, isTrue);
    });
  });

  group('thinking, an entry of its own — S-08', () {
    test('fragments of thinking become one thinking entry, never the answer', () {
      final Conversation after = applyAll(<SessionEvent>[
        const ThinkingFragment(1, messageId: 'm1', delta: 'hmm, ', at: '2026-09-14T12:00:00Z'),
        const ThinkingFragment(2, messageId: 'm1', delta: 'the build'),
        const MessageFragment(3, messageId: 'm1', delta: 'It broke', at: '2026-09-14T12:00:04Z'),
      ]);

      expect(idsOf(after), <String>['thinking:m1:0', 'message:m1']);
      expect(after.thinking.single.text, 'hmm, the build');
      expect(after.messages.single.text, 'It broke');
      // The answer starting is when the thinking stopped.
      expect(after.thinking.single.isComplete, isTrue);
      expect(after.thinking.single.duration, const Duration(seconds: 4));
    });

    test('nor when the message.completed of the answer arrives', () {
      final Conversation after = applyAll(<SessionEvent>[
        const ThinkingFragment(1, messageId: 'm1', delta: 'reasoning'),
        const MessageFinished(
          2,
          messageId: 'm1',
          text: 'the answer',
          isFromUser: false,
          thoughts: <Thought>[Thought('reasoning, whole')],
        ),
      ]);

      expect(after.messages.single.text, 'the answer');
      expect(after.thinking.single.text, 'reasoning, whole');
      expect(after.thinking.single.isComplete, isTrue);
    });

    test('a thinking block finished on its own completes the one arriving, with its time', () {
      final Conversation after = applyAll(<SessionEvent>[
        const ThinkingFragment(1, messageId: 'm1', delta: 'a', at: '2026-09-14T12:00:00Z'),
        const MessageFinished(
          2,
          messageId: 'm1',
          text: '',
          isFromUser: false,
          thoughts: <Thought>[Thought('')],
          at: '2026-09-14T12:00:02Z',
        ),
      ]);

      // An empty finished text keeps what arrived rather than erasing it.
      expect(after.thinking.single.text, 'a');
      expect(after.thinking.single.duration, const Duration(seconds: 2));
      expect(after.messages, isEmpty);
    });

    test('S-60 · three thinkings between two tools are five entries in the order they came', () {
      final Conversation after = applyAll(<SessionEvent>[
        const ThinkingFragment(1, messageId: 'm1', delta: 'one'),
        const ToolInvoked(2, toolUseId: 't1', toolName: 'Read', input: <String, Object?>{}),
        const ThinkingFragment(3, messageId: 'm2', delta: 'two'),
        const ToolInvoked(4, toolUseId: 't2', toolName: 'Read', input: <String, Object?>{}),
        const ThinkingFragment(5, messageId: 'm3', delta: 'three'),
      ]);

      expect(idsOf(after), <String>[
        'thinking:m1:0',
        'tool:t1',
        'thinking:m2:0',
        'tool:t2',
        'thinking:m3:0',
      ]);
    });

    test('a message that thinks twice numbers its thinkings', () {
      final Conversation after = applyAll(<SessionEvent>[
        const ThinkingFragment(1, messageId: 'm1', delta: 'first'),
        const MessageFragment(2, messageId: 'm1', delta: 'answer'),
        const ThinkingFragment(3, messageId: 'm1', delta: 'second'),
      ]);

      expect(idsOf(after), <String>['thinking:m1:0', 'message:m1', 'thinking:m1:1']);
    });

    test('a redacted thinking says it existed, with nothing of what was thought', () {
      final Conversation after = const Conversation().apply(
        const MessageFinished(
          1,
          messageId: 'm1',
          text: '',
          isFromUser: false,
          thoughts: <Thought>[Thought('', isRedacted: true)],
        ),
      );

      expect(after.thinking.single.isRedacted, isTrue);
      expect(after.thinking.single.isComplete, isTrue);
      expect(after.thinking.single.text, isEmpty);
    });

    test('a finished thinking the message already has is not added twice', () {
      final Conversation after = applyAll(<SessionEvent>[
        const MessageFinished(
          1,
          messageId: 'm1',
          text: '',
          isFromUser: false,
          thoughts: <Thought>[Thought('same')],
        ),
        const MessageFinished(
          2,
          messageId: 'm1',
          text: '',
          isFromUser: false,
          thoughts: <Thought>[Thought('same')],
        ),
      ]);

      expect(after.thinking, hasLength(1));
    });
  });

  group('the session around the conversation', () {
    test('a session opening means idle, and says where it runs and what it started with', () {
      final Conversation after = const Conversation().apply(
        const SessionOpened(
          1,
          'session-1',
          claudeSessionId: 'conv-1',
          workspacePath: '/home/someone/project',
          model: 'sonnet',
          permissionMode: 'plan',
        ),
      );

      expect(after.status, SessionStatus.idle);
      expect(
        after.facts,
        const SessionFacts(
          workspacePath: '/home/someone/project',
          conversationId: 'conv-1',
          model: 'sonnet',
          permissionMode: 'plan',
        ),
      );
    });

    test('an opening that says less keeps what an earlier one said', () {
      final Conversation after = applyAll(<SessionEvent>[
        const SessionOpened(1, 'session-1', model: 'sonnet', workspacePath: '/w'),
        const SessionOpened(2, 'session-1'),
      ]);

      expect(after.facts.model, 'sonnet');
      expect(after.facts.workspacePath, '/w');
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

    test('S-38 · the queue grows with prompt.queued and shrinks with prompt.dequeued', () {
      const QueuedPrompt first = QueuedPrompt(queueId: 'q1', promptedBy: 'web', preview: 'a');
      const QueuedPrompt second = QueuedPrompt(queueId: 'q2', promptedBy: 'mobile', preview: 'b');

      final Conversation queued = applyAll(<SessionEvent>[
        const PromptQueued(1, first),
        const PromptQueued(2, second),
        const PromptQueued(3, first),
      ]);

      // Delivered again, it moves to its place at the back rather than appearing twice.
      expect(queued.queue, <QueuedPrompt>[second, first]);
      expect(queued.apply(const PromptDequeued(4, queueId: 'q2')).queue, <QueuedPrompt>[first]);
    });

    test('a session that closes takes its queue with it', () {
      final Conversation after = applyAll(<SessionEvent>[
        const PromptQueued(1, QueuedPrompt(queueId: 'q1', promptedBy: 'web', preview: 'a')),
        const SessionFinished(2, SessionEnding(reason: SessionCloseReason.failed, at: 'now')),
      ]);

      expect(after.queue, isEmpty);
    });

    test('S-79 · an undo is a line where it happened: how many went back, stayed and failed', () {
      final Conversation after = const Conversation(status: SessionStatus.idle).apply(
        const FilesRewound(
          4,
          RewindOutcome(
            promptId: 'p-1',
            reverted: <RevertedFile>[
              RevertedFile(path: 'a.txt', action: RevertAction.restore),
              RevertedFile(path: 'b.txt', action: RevertAction.delete),
            ],
            preserved: <PreservedFile>[
              PreservedFile(path: 'c.txt', reason: PreserveReason.modifiedOutside),
            ],
            failed: <String>['d.txt'],
          ),
        ),
      );

      expect(after.entries.single, const RewoundLine(seq: 4, restored: 2, kept: 1, failed: 1));
      expect(after.lastSeq, 4);
      // A replay of it draws nothing twice.
      expect(after.apply(const FilesRewound(4, RewindOutcome(promptId: 'p-1'))), after);
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

  group('laying the live stream over the history', () {
    const List<SessionEvent> history = <SessionEvent>[
      MessageFinished(0, messageId: 'h1', text: 'what broke?', isFromUser: true),
      MessageFinished(
        0,
        messageId: 'h2',
        text: 'the build',
        isFromUser: false,
        thoughts: <Thought>[Thought('look at the log')],
      ),
      ToolInvoked(0, toolUseId: 't1', toolName: 'Bash', input: <String, Object?>{'command': 'ls'}),
      ToolFinished(0, toolUseId: 't1', status: ToolStatus.succeeded),
    ];

    test('no history leaves the conversation exactly as it was', () {
      final Conversation now = applyAll(<SessionEvent>[
        const MessageFragment(1, messageId: 'm1', delta: 'hi'),
      ]);

      expect(now.withHistory(const <SessionEvent>[]), same(now));
    });

    test('history alone is the whole conversation, in its order, and moves no resume point', () {
      final Conversation shown = const Conversation().withHistory(history);

      expect(idsOf(shown), <String>['message:h1', 'thinking:h2:0', 'message:h2', 'tool:t1']);
      expect(shown.messages.first.isFromUser, isTrue);
      expect(shown.tools.single.status, ToolStatus.succeeded);
      // From the history there is no instant, so no duration — never "0 s" (S-61).
      expect(shown.thinking.single.duration, isNull);
      expect(shown.lastSeq, 0);
      // History says nothing about where the live session is; only the stream does.
      expect(shown.status, SessionStatus.starting);
    });

    test('what is live and new comes after the history, in the order it arrived', () {
      final Conversation shown = applyAll(<SessionEvent>[
        const MessageFinished(1, messageId: 'n1', text: 'fixed', isFromUser: false),
        const MessageFragment(2, messageId: 'n2', delta: 'and'),
      ]).withHistory(history);

      expect(idsOf(shown).skip(4), <String>['message:n1', 'message:n2']);
    });

    test('S-15 · a live entry with a historical id replaces it in place, never twice', () {
      final Conversation shown = applyAll(<SessionEvent>[
        const MessageFinished(7, messageId: 'h2', text: 'the build, again', isFromUser: false),
        const ToolInvoked(8, toolUseId: 't1', toolName: 'Bash', input: <String, Object?>{}),
      ]).withHistory(history);

      expect(idsOf(shown), <String>['message:h1', 'thinking:h2:0', 'message:h2', 'tool:t1']);
      expect(shown.messages.last.text, 'the build, again');
      // The live tool is re-running: what the stream says now wins over what the transcript said.
      expect(shown.tools.single.status, ToolStatus.running);
    });

    test('a live message still streaming never replaces a historical one that is whole', () {
      final Conversation shown = applyAll(<SessionEvent>[
        const MessageFragment(3, messageId: 'h2', delta: 'the bu'),
      ]).withHistory(history);

      expect(shown.messages.last.text, 'the build');
      expect(shown.messages.last.isComplete, isTrue);
    });

    test('S-21 · status, resume point, queue, facts, last turn and ending stay the live ones', () {
      const TurnSummary turn = TurnSummary(turnId: 'turn-1', costUsd: '0.01', durationMs: 5);
      const SessionEnding ending = SessionEnding(reason: SessionCloseReason.completed, at: 'now');
      final Conversation now = applyAll(<SessionEvent>[
        const SessionOpened(1, 'session-1', model: 'opus'),
        const SessionStatusReported(2, SessionStatus.running),
        const TurnFinished(3, turn),
        const SessionFinished(4, ending),
      ]);

      final Conversation shown = now.withHistory(history);

      expect(shown.status, SessionStatus.closed);
      expect(shown.lastSeq, 4);
      expect(shown.lastTurn, turn);
      expect(shown.ending, ending);
      expect(shown.facts.model, 'opus');
    });

    test('laying it over again changes nothing — a reload is idempotent', () {
      final Conversation now = applyAll(<SessionEvent>[
        const MessageFinished(1, messageId: 'h2', text: 'the build', isFromUser: false),
      ]);

      expect(now.withHistory(history), now.withHistory(history).withHistory(history));
    });
  });

  group('what the session cost — S-47', () {
    test('adds each turn once, as decimals', () {
      final Conversation conversation = applyAll(<SessionEvent>[
        const TurnFinished(1, TurnSummary(turnId: 't1', costUsd: '0.1', durationMs: 1)),
        const TurnFinished(2, TurnSummary(turnId: 't2', costUsd: '0.2', durationMs: 1)),
        const TurnFinished(2, TurnSummary(turnId: 't2', costUsd: '0.2', durationMs: 1)),
      ]);

      expect(conversation.turns, hasLength(2));
      // 0.1 + 0.2 as binary floats is 0.30000000000000004.
      expect(conversation.costUsd, '0.3');
    });

    test('nothing ended is no cost, and a whole number has no point', () {
      expect(const Conversation().costUsd, '0');
      expect(addUsd(<String>['1.50', '2.5']), '4');
    });

    test('keeps what a fraction of a cent carries, and drops what is not money', () {
      expect(addUsd(<String>['0.000001', ' 0.000002 ', 'abc', '-1', '']), '0.000003');
      expect(addUsd(<String>['12']), '12');
    });
  });

  group('the turn that runs — B-18', () {
    test(
      'a turn starting is timed from its status; moving within it keeps the start; ending clears',
      () {
        final Conversation thinking = applyAll(<SessionEvent>[
          const SessionStatusReported(1, SessionStatus.thinking, at: '2026-09-14T12:00:00.000Z'),
        ]);
        expect(thinking.turnStartedAt, '2026-09-14T12:00:00.000Z');

        final Conversation running = thinking.apply(
          const SessionStatusReported(2, SessionStatus.running, at: '2026-09-14T12:00:09.000Z'),
        );
        expect(running.turnStartedAt, '2026-09-14T12:00:00.000Z');

        final Conversation idle = running.apply(const SessionStatusReported(3, SessionStatus.idle));
        expect(idle.turnStartedAt, isNull);
        // Kept through anything else that arrives.
        expect(
          running
              .apply(const TurnFinished(4, TurnSummary(turnId: 't', costUsd: '0', durationMs: 1)))
              .turnStartedAt,
          '2026-09-14T12:00:00.000Z',
        );
      },
    );

    test('a turn the stream did not time has no start', () {
      expect(
        const Conversation()
            .apply(const SessionStatusReported(1, SessionStatus.thinking))
            .turnStartedAt,
        isNull,
      );
    });

    test('S-55 · the tool running is the last of the main conversation not ended', () {
      final Conversation conversation = applyAll(<SessionEvent>[
        const ToolInvoked(1, toolUseId: 'a', toolName: 'Read', input: <String, Object?>{}),
        const ToolFinished(2, toolUseId: 'a', status: ToolStatus.succeeded),
        const ToolInvoked(3, toolUseId: 'b', toolName: 'Bash', input: <String, Object?>{}),
        const ToolInvoked(
          4,
          toolUseId: 'c',
          toolName: 'Grep',
          input: <String, Object?>{},
          isSubagent: true,
        ),
      ]);

      expect(conversation.runningTool?.toolName, 'Bash');
      expect(const Conversation().runningTool, isNull);
    });

    test('B-23 · the task a call ended with is kept on the tool', () {
      final Conversation conversation = applyAll(<SessionEvent>[
        const ToolInvoked(1, toolUseId: 'a', toolName: 'TaskCreate', input: <String, Object?>{}),
        const ToolFinished(2, toolUseId: 'a', status: ToolStatus.succeeded, taskId: '7'),
      ]);

      expect(conversation.tools.single.taskId, '7');
    });

    test('S-79 · a partial replay starts with the line that says so', () {
      expect(idsOf(const Conversation.partial()), <String>['gap']);
      expect(const Conversation.partial().isEmpty, isFalse);
    });

    test('S-82 · what a session continues is part of what it said about itself', () {
      final Conversation opened = const Conversation().apply(
        const SessionOpened(1, 's-2', claudeSessionId: 'c-2', resumedFrom: 'c-1'),
      );

      expect(opened.facts.resumedFrom, 'c-1');
      expect(opened.apply(const SessionOpened(2, 's-2')).facts.resumedFrom, 'c-1');
    });
  });

  group('the identity of a block — plan 22, B-13', () {
    test('S-35 · two thinkings the model did not show in one answer are two', () {
      final Conversation after = applyAll(<SessionEvent>[
        const MessageFinished(
          1,
          messageId: 'm1',
          text: '',
          isFromUser: false,
          thoughts: <Thought>[Thought('', blockId: 'u1:0')],
        ),
        const MessageFinished(
          2,
          messageId: 'm1',
          text: '',
          isFromUser: false,
          thoughts: <Thought>[Thought('', blockId: 'u2:0')],
        ),
      ]);

      expect(after.thinking.map((ThinkingEntry each) => each.blockId), <String>['u1:0', 'u2:0']);
    });

    test('S-36 · the block a page and a follower both delivered is shown once', () {
      const MessageFinished block = MessageFinished(
        0,
        messageId: 'm1',
        text: 'Once.',
        isFromUser: false,
        textBlockIds: <String>['u1:0'],
        thoughts: <Thought>[Thought('', blockId: 'u0:0')],
      );
      final Conversation shown = const Conversation().withHistory(<SessionEvent>[block, block]);

      expect(shown.messages.single.blocks, <String>['Once.']);
      expect(shown.messages.single.blockIds, <String>['u1:0']);
      expect(shown.thinking, hasLength(1));
    });

    test('S-37 · a block with no identity keeps the old rule', () {
      final Conversation after = applyAll(<SessionEvent>[
        const MessageFinished(1, messageId: 'm1', text: 'Same.', isFromUser: false),
        const MessageFinished(
          2,
          messageId: 'm1',
          text: 'Same.',
          isFromUser: false,
          textBlockIds: <String>['u1:0'],
        ),
        const MessageFinished(
          3,
          messageId: 'm1',
          text: '',
          isFromUser: false,
          thoughts: <Thought>[Thought('t', blockId: 'u2:0')],
        ),
        const MessageFinished(
          4,
          messageId: 'm1',
          text: '',
          isFromUser: false,
          thoughts: <Thought>[Thought('t')],
        ),
      ]);

      expect(after.messages.single.blocks, <String>['Same.']);
      expect(after.thinking, hasLength(1));
    });

    test('S-38 · a live session joins its history by message, nothing doubled or lost', () {
      final Conversation shown =
          applyAll(<SessionEvent>[
            const MessageFinished(
              5,
              messageId: 'h2',
              text: 'live',
              isFromUser: false,
              textBlockIds: <String>['u4:0'],
            ),
          ]).withHistory(const <SessionEvent>[
            MessageFinished(
              0,
              messageId: 'h1',
              text: 'old',
              isFromUser: true,
              textBlockIds: <String>['u1:0'],
            ),
            MessageFinished(
              0,
              messageId: 'h2',
              text: 'live',
              isFromUser: false,
              textBlockIds: <String>['u4:0'],
            ),
          ]);

      expect(idsOf(shown), <String>['message:h1', 'message:h2']);
      expect(shown.messages.last.blocks, <String>['live']);
    });

    test('S-39 · new entries of an answer already begun fall into it, in order', () {
      final Conversation after = applyAll(<SessionEvent>[
        const MessageFinished(
          1,
          messageId: 'm1',
          text: 'A',
          isFromUser: false,
          textBlockIds: <String>['u1:0'],
        ),
        const MessageFinished(
          2,
          messageId: 'm1',
          text: 'B',
          isFromUser: false,
          textBlockIds: <String>['u2:0'],
        ),
      ]);

      expect(after.messages.single.text, 'AB');
      expect(after.messages.single.blockIds, <String>['u1:0', 'u2:0']);
    });
  });
}
