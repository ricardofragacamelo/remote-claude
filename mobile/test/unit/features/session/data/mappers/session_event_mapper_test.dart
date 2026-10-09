/// Reading a frame as something the app has words for.
///
/// The wire stops here: above this file nothing has seen an `Envelope`. What the app then *does*
/// with an event is the conversation's own test.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/network/contracts/frame_codec.dart';
import 'package:remote_claude/features/session/data/mappers/session_event_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';

import '../../../../../support/builders/frames.dart';
import '../../../../../support/builders/undo.dart';

/// The event carried by one line of wire text.
SessionEvent? read(String raw) => sessionEventFrom(decodeEnvelope(raw)!);

void main() {
  test('a session opening names the session it opened', () {
    final SessionEvent? event = read(sessionStarted(sessionId: 'session-1'));

    expect(event, isA<SessionOpened>());
    final SessionOpened opened = event! as SessionOpened;
    expect(opened.sessionId, 'session-1');
    expect(opened.claudeSessionId, isNull);
    expect(opened.resumedFrom, isNull);
  });

  test('B-11 · a session opening names its conversation, and the one it continues', () {
    final SessionOpened opened =
        read(
              sessionStarted(
                sessionId: 'session-1',
                claudeSessionId: 'conv-2',
                resumedFrom: 'conv-1',
              ),
            )!
            as SessionOpened;

    expect(opened.claudeSessionId, 'conv-2');
    expect(opened.resumedFrom, 'conv-1');
  });

  test('reads each status the contract carries', () {
    const Map<String, SessionStatus> known = <String, SessionStatus>{
      'starting': SessionStatus.starting,
      'idle': SessionStatus.idle,
      'thinking': SessionStatus.thinking,
      'running': SessionStatus.running,
      'waitingPermission': SessionStatus.waitingPermission,
      'closed': SessionStatus.closed,
    };

    known.forEach((String raw, SessionStatus expected) {
      final SessionEvent? event = read(sessionStatusChanged(status: raw, seq: 1));
      expect((event! as SessionStatusReported).status, expected, reason: raw);
    });
  });

  test('reads a fragment and a finished message', () {
    final MessageFragment fragment =
        read(messageDelta(messageId: 'm1', delta: 'Hel', seq: 1))! as MessageFragment;
    expect(fragment.messageId, 'm1');
    expect(fragment.delta, 'Hel');

    final MessageFinished finished =
        read(messageCompleted(messageId: 'm1', text: 'Hello', seq: 2, role: 'user'))!
            as MessageFinished;
    expect(finished.text, 'Hello');
    expect(finished.isFromUser, isTrue);
  });

  test('a finished message with no content block reads as empty text', () {
    final MessageFinished finished =
        read(
              frame(
                kind: 'event',
                type: 'message.completed',
                seq: 1,
                payload: <String, Object?>{'messageId': 'm1'},
              ),
            )!
            as MessageFinished;

    expect(finished.text, isEmpty);
    expect(finished.isFromUser, isFalse);
  });

  test('reads a tool from its invocation to its outcome, keeping the exact input', () {
    final ToolInvoked invoked =
        read(
              toolStarted(
                toolUseId: 't1',
                seq: 1,
                input: <String, Object?>{'command': 'rm -rf /tmp/x'},
              ),
            )!
            as ToolInvoked;
    expect(invoked.input['command'], 'rm -rf /tmp/x');

    final ToolOutput output =
        read(toolProgress(toolUseId: 't1', chunk: 'gone', seq: 2))! as ToolOutput;
    expect(output.chunk, 'gone');

    final ToolFinished finished =
        read(toolCompleted(toolUseId: 't1', seq: 3, summary: 'removed'))! as ToolFinished;
    expect(finished.status, ToolStatus.succeeded);
    expect(finished.summary, 'removed');
  });

  test('a tool with no input at all reads as an empty input rather than throwing', () {
    final ToolInvoked invoked =
        read(
              frame(
                kind: 'event',
                type: 'tool.started',
                seq: 1,
                payload: <String, Object?>{'toolUseId': 't1', 'toolName': 'Read'},
              ),
            )!
            as ToolInvoked;

    expect(invoked.input, isEmpty);
  });

  test('reads each outcome a tool can have', () {
    const Map<String, ToolStatus> known = <String, ToolStatus>{
      'succeeded': ToolStatus.succeeded,
      'failed': ToolStatus.failed,
      'denied': ToolStatus.denied,
    };

    known.forEach((String raw, ToolStatus expected) {
      final SessionEvent? event = read(toolCompleted(toolUseId: 't1', seq: 1, status: raw));
      expect((event! as ToolFinished).status, expected, reason: raw);
    });
  });

  test(
    'S-103 · keeps the question an end carries, as the wire said it — none when it has none',
    () {
      const Map<String, Object?> question = <String, Object?>{
        'interaction': <String, Object?>{'kind': 'question'},
        'outcome': 'answered',
      };

      expect(
        (read(toolCompleted(toolUseId: 't1', seq: 1, question: question))! as ToolFinished)
            .question,
        question,
      );
      expect((read(toolCompleted(toolUseId: 't1', seq: 1))! as ToolFinished).question, isNull);
    },
  );

  test('reads what a turn cost, and each reason a session can end with', () {
    final TurnFinished turn =
        read(turnCompleted(seq: 1, costUsd: '0.2740', durationMs: 4200))! as TurnFinished;
    expect(turn.turn.costUsd, '0.2740');
    expect(turn.turn.durationMs, 4200);

    const Map<String, SessionCloseReason> known = <String, SessionCloseReason>{
      'closedByUser': SessionCloseReason.closedByUser,
      'completed': SessionCloseReason.completed,
      'failed': SessionCloseReason.failed,
      'auditUnavailable': SessionCloseReason.auditUnavailable,
      'shutdown': SessionCloseReason.shutdown,
      'idleTimeout': SessionCloseReason.idleTimeout,
    };

    known.forEach((String raw, SessionCloseReason expected) {
      final SessionEvent? event = read(sessionClosed(seq: 1, reason: raw));
      expect((event! as SessionFinished).ending.reason, expected, reason: raw);
    });
  });

  test('a pong is read as one, so the round-trip screen can find it', () {
    final PongArrived arrived =
        read(diagPong(sessionId: 'session-1', seq: 4, nonce: 'n-1'))! as PongArrived;

    expect(arrived.pong.nonce, 'n-1');
    expect(arrived.seq, 4);
  });

  group('what it cannot read', () {
    test(
      'an event added to the contract after this build shipped still moves the resume point',
      () {
        // A published app has to survive the contract growing an event it has never heard of
        // (S-77). Dropping it would have the client ask for it again after every reconnection.
        final SessionEvent? event = read(
          frame(kind: 'event', type: 'session.somethingNew', seq: 9, payload: <String, Object?>{}),
        );

        expect(event, isA<UnreadEvent>());
        expect(event!.seq, 9);
      },
    );

    test('a payload missing the field its event is about is unreadable, not fatal', () {
      final List<String> incomplete = <String>[
        frame(
          kind: 'event',
          type: 'message.delta',
          seq: 1,
          payload: <String, Object?>{'delta': 'x'},
        ),
        frame(kind: 'event', type: 'message.completed', seq: 1, payload: <String, Object?>{}),
        frame(
          kind: 'event',
          type: 'tool.started',
          seq: 1,
          payload: <String, Object?>{'toolUseId': 't'},
        ),
        frame(kind: 'event', type: 'tool.progress', seq: 1, payload: <String, Object?>{}),
        frame(
          kind: 'event',
          type: 'tool.completed',
          seq: 1,
          payload: <String, Object?>{'toolUseId': 't'},
        ),
        frame(
          kind: 'event',
          type: 'turn.completed',
          seq: 1,
          payload: <String, Object?>{'turnId': 't'},
        ),
        frame(kind: 'event', type: 'session.closed', seq: 1, payload: <String, Object?>{}),
        frame(
          kind: 'event',
          type: 'session.statusChanged',
          seq: 1,
          payload: <String, Object?>{'status': 'napping'},
        ),
        frame(kind: 'event', type: 'session.started', seq: 1, payload: <String, Object?>{}),
      ];

      for (final String line in incomplete) {
        expect(read(line), isA<UnreadEvent>(), reason: line);
      }
    });

    test('B-05 · a frame of another stream is no event of a session, whatever its seq', () {
      // The watch of a folder numbers its own stream; read as an unknown event of a session, its
      // seq would move the resume point of the session past events it never sent.
      // A followed conversation numbers its `followId` the same way (plan 22, B-24).
      for (final String type in <String>[
        'workspace.filesChanged',
        'workspace.watchStopped',
        'transcript.appended',
        'transcript.reset',
      ]) {
        expect(
          read(
            frame(
              kind: 'event',
              type: type,
              seq: 500,
              payload: <String, Object?>{'watchId': 'w-1', 'changes': <Object?>[]},
            ),
          ),
          isNull,
          reason: type,
        );
      }
    });

    test(
      'S-09 · a subagent and a block kind this build does not know are unread, with the seq',
      () {
        // The web panel nests a subagent (B-02); this app does not, and its text read as the answer
        // would interleave with it. A block kind added later reaches nothing either.
        final List<String> notDrawn = <String>[
          frame(
            kind: 'event',
            type: 'message.delta',
            seq: 21,
            payload: <String, Object?>{'messageId': 'm', 'delta': 'hm', 'blockType': 'hologram'},
          ),
          frame(
            kind: 'event',
            type: 'message.delta',
            seq: 21,
            payload: <String, Object?>{'messageId': 'm', 'delta': 'x', 'parentToolUseId': 'task'},
          ),
          frame(
            kind: 'event',
            type: 'message.completed',
            seq: 21,
            payload: <String, Object?>{
              'messageId': 'm',
              'role': 'assistant',
              'content': <Object?>[],
              'parentToolUseId': 'task',
            },
          ),
        ];

        for (final String line in notDrawn) {
          final SessionEvent? event = read(line);

          expect(event, isA<UnreadEvent>(), reason: line);
          expect(event!.seq, 21, reason: line);
        }
      },
    );

    test('S-08 · a fragment of thinking is thinking, with when it arrived — never the answer', () {
      final SessionEvent? event = read(
        thinkingDelta(messageId: 'm', delta: 'hm', seq: 22, ts: '2026-09-14T12:00:03.000Z'),
      );

      expect(
        event,
        const ThinkingFragment(22, messageId: 'm', delta: 'hm', at: '2026-09-14T12:00:03.000Z'),
      );
    });

    test('the kind of a fragment is the answer when it says nothing', () {
      expect(blockTypeOf(const <String, Object?>{}), 'text');
      expect(blockTypeOf(const <String, Object?>{'blockType': 'thinking'}), 'thinking');
      expect(blockTypeOf(const <String, Object?>{'blockType': 3}), 'text');
    });

    test('plan 08 · a delta that names its block as text is the answer', () {
      final SessionEvent? event = read(
        frame(
          kind: 'event',
          type: 'message.delta',
          seq: 3,
          payload: <String, Object?>{'messageId': 'm', 'delta': 'hi', 'blockType': 'text'},
        ),
      );

      expect(event, isA<MessageFragment>());
    });

    test(
      'S-08 · a finished message keeps its thinking out of the text, as thoughts of its own',
      () {
        final SessionEvent? event = read(
          messageBlocks(
            messageId: 'm',
            seq: 4,
            ts: '2026-09-14T12:00:09.000Z',
            content: <Map<String, Object?>>[
              <String, Object?>{'type': 'thinking', 'thinking': 'let me see'},
              <String, Object?>{'type': 'redacted_thinking'},
              <String, Object?>{'type': 'thinking'},
              <String, Object?>{'type': 'text', 'text': 'Done.'},
            ],
          ),
        );

        final MessageFinished finished = event! as MessageFinished;
        expect(finished.text, 'Done.');
        expect(finished.thoughts, const <Thought>[
          Thought('let me see'),
          Thought('', isRedacted: true),
          Thought(''),
        ]);
        expect(finished.at, '2026-09-14T12:00:09.000Z');
      },
    );

    test('a block that calls a tool, or one of an unknown kind, is no text of the answer', () {
      final SessionEvent? event = read(
        messageBlocks(
          messageId: 'm',
          seq: 5,
          content: <Map<String, Object?>>[
            <String, Object?>{'type': 'tool_use', 'toolUseId': 't1', 'text': 'not this'},
            <String, Object?>{'type': 'hologram', 'text': 'nor this'},
          ],
        ),
      );

      final MessageFinished finished = event! as MessageFinished;
      expect(finished.text, isEmpty);
      expect(finished.thoughts, isEmpty);
    });

    test('S-38 · the queue and the compaction are read with their seq', () {
      expect(
        read(promptQueued(queueId: 'q', seq: 30, preview: 'p', promptedBy: 'web')),
        const PromptQueued(30, QueuedPrompt(queueId: 'q', promptedBy: 'web', preview: 'p')),
      );
      expect(read(promptDequeued(queueId: 'q', seq: 31)), const PromptDequeued(31, queueId: 'q'));
      expect(
        read(sessionCompacted(seq: 32, preTokens: 120000)),
        const ContextCompacted(32, trigger: 'manual', preTokens: 120000),
      );
    });

    test(
      'a queue entry with only its id reads with empty words, and a bare compaction as automatic',
      () {
        expect(
          read(
            frame(
              kind: 'event',
              type: 'prompt.queued',
              seq: 1,
              payload: <String, Object?>{'queueId': 'q'},
            ),
          ),
          const PromptQueued(1, QueuedPrompt(queueId: 'q', promptedBy: '', preview: '')),
        );
        expect(
          read(
            frame(
              kind: 'event',
              type: 'session.compacted',
              seq: 2,
              payload: <String, Object?>{'preTokens': 'many'},
            ),
          ),
          const ContextCompacted(2, trigger: 'auto'),
        );
      },
    );

    test('13 · S-11 · the MCP status of a session is unread, and still moves the resume point', () {
      final SessionEvent? event = read(
        frame(
          kind: 'event',
          type: 'session.mcpStatusChanged',
          seq: 12,
          payload: <String, Object?>{
            'servers': <Object?>[
              <String, Object?>{
                'name': 'github',
                'status': 'connected',
                'source': 'ours',
                'toolCount': 3,
              },
            ],
          },
        ),
      );

      expect(event, isA<UnreadEvent>());
      expect(event!.seq, 12);
    });

    test('13 · S-11 · a session opening with the fields of plan 13 still reads as an opening', () {
      final SessionEvent? event = read(
        frame(
          kind: 'event',
          type: 'session.started',
          seq: 1,
          payload: <String, Object?>{
            'sessionId': 'session-1',
            'workspacePath': '/srv/app',
            'model': 'sonnet',
            'permissionMode': 'default',
            'claudeSessionId': 'conv-1',
            'effort': 'high',
            'outputStyle': 'Concise',
            'defaultsFrom': 'folder',
          },
        ),
      );

      expect(event, isA<SessionOpened>());
      expect((event! as SessionOpened).sessionId, 'session-1');
    });

    test('a queue event that names no prompt is unread, with its seq', () {
      for (final String type in <String>['prompt.queued', 'prompt.dequeued']) {
        final SessionEvent? event = read(
          frame(kind: 'event', type: type, seq: 33, payload: <String, Object?>{}),
        );

        expect(event, isA<UnreadEvent>(), reason: type);
        expect(event!.seq, 33);
      }
    });

    test('S-22 · a session opening says what it started with and which command opened it', () {
      final SessionOpened opened =
          read(
                sessionStarted(
                  sessionId: 's',
                  model: 'sonnet',
                  permissionMode: 'plan',
                  correlationId: 'cmd-7',
                  workspacePath: '/home/someone/project',
                ),
              )!
              as SessionOpened;

      expect(opened.model, 'sonnet');
      expect(opened.permissionMode, 'plan');
      expect(opened.commandId, 'cmd-7');
      expect(opened.workspacePath, '/home/someone/project');
    });

    test('a frame with no seq is not part of the history at all', () {
      // A question is asked, not recorded: it belongs to the permission queue.
      expect(
        read(
          frame(
            kind: 'request',
            type: 'permission.requested',
            payload: <String, Object?>{'requestId': 'r1'},
          ),
        ),
        isNull,
      );
    });
  });

  group('S-02 · history goes through the same reader as the live frames', () {
    test('a historical message is the event the live one would be, with no seq', () {
      final String raw = messageCompleted(messageId: 'm1', text: 'Hello', seq: 12, role: 'user');

      final SessionEvent historical = historyEventFrom(historyEntry(raw))!;

      expect(
        historical,
        const MessageFinished(historySeq, messageId: 'm1', text: 'Hello', isFromUser: true),
      );
      expect(historical.seq, 0);
    });

    test('a historical tool and its outcome read as the live ones do', () {
      expect(
        historyEventFrom(historyEntry(toolStarted(toolUseId: 't1', seq: 3))),
        const ToolInvoked(
          historySeq,
          toolUseId: 't1',
          toolName: 'Bash',
          input: <String, Object?>{'command': 'ls'},
        ),
      );
      expect(
        historyEventFrom(historyEntry(toolCompleted(toolUseId: 't1', seq: 4, summary: 'ok'))),
        const ToolFinished(
          historySeq,
          toolUseId: 't1',
          status: ToolStatus.succeeded,
          summary: 'ok',
        ),
      );
    });

    test('an entry this build cannot read is dropped — it has no seq to move past', () {
      final List<Object?> unreadable = <Object?>[
        null,
        'message.completed',
        <String, Object?>{'type': 'message.completed'},
        <String, Object?>{'payload': <String, Object?>{}},
        <String, Object?>{'type': 7, 'payload': <String, Object?>{}},
        <String, Object?>{'type': 'message.completed', 'payload': <String, Object?>{}},
        <String, Object?>{
          'type': 'diag.pong',
          'payload': <String, Object?>{'nonce': 'n'},
        },
        <String, Object?>{'type': 'something.new', 'payload': <String, Object?>{}},
      ];

      for (final Object? entry in unreadable) {
        expect(historyEventFrom(entry), isNull, reason: '$entry');
      }
    });
  });

  group('B-18 · what an undo did', () {
    test('reaches the app as the outcome, with the seq that moves the resume point', () {
      final SessionEvent? event = read(sessionRewound(seq: 7, payload: rewoundPayload()));

      expect(event, FilesRewound(7, anOutcome()));
    });

    test('an outcome this build cannot read still moves the resume point', () {
      expect(
        read(sessionRewound(seq: 8, payload: <String, Object?>{'promptId': 'p-1'})),
        const UnreadEvent(8),
      );
    });

    test('in the history it is read the same way, with no seq of its own', () {
      expect(
        historyEventFrom(historyEntry(sessionRewound(seq: 3, payload: rewoundPayload()))),
        FilesRewound(historySeq, anOutcome()),
      );
    });
  });

  group('plan 10, F4', () {
    test('B-18 · a status carries when it happened — what a turn is timed from', () {
      expect(
        read(sessionStatusChanged(status: 'thinking', seq: 3, ts: '2026-09-14T12:00:05.000Z')),
        const SessionStatusReported(3, SessionStatus.thinking, at: '2026-09-14T12:00:05.000Z'),
      );
    });

    test('B-23 · a tool of a subagent says so; a task call ends with its task', () {
      final SessionEvent? started = read(
        toolStarted(toolUseId: 't1', seq: 1, toolName: 'TaskCreate', parentToolUseId: 'task-0'),
      );
      expect((started! as ToolInvoked).isSubagent, isTrue);
      expect((read(toolStarted(toolUseId: 't2', seq: 2))! as ToolInvoked).isSubagent, isFalse);

      expect(
        read(toolCompleted(toolUseId: 't1', seq: 3, taskId: '7')),
        const ToolFinished(3, toolUseId: 't1', status: ToolStatus.succeeded, taskId: '7'),
      );
    });
  });

  group('plan 22, B-13 · the identity of each block', () {
    test('reads the id of each text and thinking block, and leaves out what has none', () {
      final SessionEvent? event = historyEventFrom(<String, Object?>{
        'type': 'message.completed',
        'payload': <String, Object?>{
          'messageId': 'm1',
          'role': 'assistant',
          'content': <Object?>[
            <String, Object?>{'type': 'thinking', 'blockId': 'u1:0'},
            <String, Object?>{'type': 'redacted_thinking', 'blockId': 'u1:1'},
            <String, Object?>{'type': 'text', 'text': 'A', 'blockId': 'u1:2'},
            <String, Object?>{'type': 'text', 'text': 'B'},
          ],
        },
      });

      expect(
        event,
        const MessageFinished(
          historySeq,
          messageId: 'm1',
          text: 'AB',
          isFromUser: false,
          textBlockIds: <String>['u1:2'],
          thoughts: <Thought>[
            Thought('', blockId: 'u1:0'),
            Thought('', isRedacted: true, blockId: 'u1:1'),
          ],
        ),
      );
    });
  });

  group('what the Claude Code shows — plan 22, F6', () {
    test('S-118 · an image block is a marker: its block, type and size — never bytes', () {
      final SessionEvent? event = historyEventFrom(<String, Object?>{
        'type': 'message.completed',
        'payload': <String, Object?>{
          'messageId': 'u1',
          'role': 'user',
          'at': '2026-10-07T12:00:00.000Z',
          'content': <Object?>[
            <String, Object?>{'type': 'text', 'text': 'see', 'blockId': 'u1:0'},
            <String, Object?>{
              'type': 'image',
              'blockId': 'u1:1',
              'mediaType': 'image/png',
              'size': 48213,
            },
            <String, Object?>{'type': 'image', 'size': -1},
            <String, Object?>{'type': 'image', 'mediaType': 7, 'size': '12'},
          ],
        },
      });

      expect(
        event,
        const MessageFinished(
          historySeq,
          messageId: 'u1',
          text: 'see',
          isFromUser: true,
          textBlockIds: <String>['u1:0'],
          images: <PromptImage>[
            PromptImage(blockId: 'u1:1', mediaType: 'image/png', size: 48213),
            PromptImage(),
            PromptImage(),
          ],
          writtenAt: '2026-10-07T12:00:00.000Z',
        ),
      );
    });

    test('S-121 · a prompt of only an image reads as a prompt, with no text', () {
      final MessageFinished prompt =
          historyEventFrom(<String, Object?>{
                'type': 'message.completed',
                'payload': <String, Object?>{
                  'messageId': 'u1',
                  'role': 'user',
                  'content': <Object?>[
                    <String, Object?>{'type': 'image', 'blockId': 'u1:0'},
                  ],
                },
              })!
              as MessageFinished;

      expect(prompt.isFromUser, isTrue);
      expect(prompt.text, isEmpty);
      expect(prompt.images, const <PromptImage>[PromptImage(blockId: 'u1:0')]);
    });

    test('S-111 · a call says what it is for when the model said; blank or absent is no title', () {
      ToolInvoked started(Object? title) =>
          historyEventFrom(<String, Object?>{
                'type': 'tool.started',
                'payload': <String, Object?>{
                  'toolUseId': 't1',
                  'toolName': 'Bash',
                  'input': <String, Object?>{'command': 'pnpm test'},
                  'title': ?title,
                },
              })!
              as ToolInvoked;

      expect(started('Run the tests').title, 'Run the tests');
      expect(started('   ').title, isNull);
      expect(started(null).title, isNull);
      expect(started(3).title, isNull);
    });

    test('S-104 · the history dates the entries a duration is read between', () {
      Map<String, Object?> dated(String raw) => <String, Object?>{
        ...historyEntry(raw),
        'payload': <String, Object?>{
          ...historyEntry(raw)['payload']! as Map<String, Object?>,
          'at': '2026-10-07T12:00:05.000Z',
        },
      };

      expect(
        historyEventFrom(dated(toolStarted(toolUseId: 't1', seq: 3)))!.writtenAt,
        '2026-10-07T12:00:05.000Z',
      );
      expect(
        historyEventFrom(dated(toolCompleted(toolUseId: 't1', seq: 4)))!.writtenAt,
        '2026-10-07T12:00:05.000Z',
      );
      expect(
        historyEventFrom(dated(messageCompleted(messageId: 'm1', text: 'x', seq: 5)))!.writtenAt,
        '2026-10-07T12:00:05.000Z',
      );
    });

    test('S-106 · live, and from a server older than the instants, nothing is dated', () {
      expect(read(toolStarted(toolUseId: 't1', seq: 3))!.writtenAt, isEmpty);
      expect(read(toolCompleted(toolUseId: 't1', seq: 4))!.writtenAt, isEmpty);
      expect(historyEventFrom(historyEntry(toolStarted(toolUseId: 't1', seq: 3)))!.writtenAt, '');
      expect(read(sessionStarted(sessionId: 'session-1'))!.writtenAt, isEmpty);
    });
  });
}
