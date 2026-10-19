/// Reading a frame as something the app has words for.
///
/// The wire stops here: above this file nothing has seen an `Envelope`. What the app then *does*
/// with an event is the conversation's own test.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/conversation/tool_call.dart';
import 'package:remote_claude/core/network/contracts/frame_codec.dart';
import 'package:remote_claude/features/session/data/mappers/session_event_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/insight.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';

import '../../../../../support/builders/conversations.dart';
import '../../../../../support/builders/frames.dart';
import '../../../../../support/builders/tools.dart';
import '../../../../../support/builders/undo.dart';

/// The event carried by one line of wire text.
SessionEvent? read(String raw) => sessionEventFrom(decodeEnvelope(raw)!);

void main() {
  test('a session opening names the session it opened', () {
    final SessionEvent? event = read(sessionStarted(sessionId: 'session-1'));

    expect(event, isA<SessionOpened>());
    final SessionOpened opened = event! as SessionOpened;
    expect(opened.sessionId, 'session-1');
    expect(opened.conversation, isNull);
    expect(opened.resumedFrom, isNull);
    expect(opened.engine, isNull);
    expect(opened.capabilities, isNull);
  });

  test('B-11 · a session opening names its conversation, and the one it continues', () {
    final SessionOpened opened =
        read(sessionStarted(sessionId: 'session-1', conversation: 'conv-2', resumedFrom: 'conv-1'))!
            as SessionOpened;

    expect(opened.conversation, conversationOf('conv-2'));
    expect(opened.resumedFrom, conversationOf('conv-1'));
  });

  test(
    'S-39 · a session opening names its engine, and keeps what the engine declared it can do',
    () {
      final SessionOpened opened =
          read(
                sessionStarted(
                  sessionId: 'session-1',
                  conversation: 'conv-2',
                  engine: anEngine,
                  capabilities: capabilitiesJson(),
                ),
              )!
              as SessionOpened;

      expect(opened.engine, anEngine);
      expect(opened.capabilities, someCapabilities);
    },
  );

  test('a declaration of capabilities missing a field is not read as having nothing', () {
    final Map<String, Object?> partial = capabilitiesJson()..remove('fork');
    final SessionOpened opened =
        read(sessionStarted(sessionId: 'session-1', capabilities: partial))! as SessionOpened;

    expect(opened.capabilities, isNull);
  });

  test(
    'the previous protocol\'s bare ids are not conversations: no engine says whose they are',
    () {
      final SessionOpened opened =
          read(
                frame(
                  kind: 'event',
                  type: 'session.started',
                  sessionId: 'session-1',
                  seq: 1,
                  payload: <String, Object?>{
                    'sessionId': 'session-1',
                    'conversation': 'conv-2',
                    'resumedFrom': <String, Object?>{'engine': '', 'id': 'conv-1'},
                  },
                ),
              )!
              as SessionOpened;

      expect(opened.conversation, isNull);
      expect(opened.resumedFrom, isNull);
    },
  );

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
        read(toolStarted(toolUseId: 't1', seq: 1, call: shellCall('rm -rf /tmp/x')))!
            as ToolInvoked;
    expect(invoked.call, shellCall('rm -rf /tmp/x'));
    expect(invoked.call.rawInput['command'], 'rm -rf /tmp/x');

    final ToolOutput output =
        read(toolProgress(toolUseId: 't1', chunk: 'gone', seq: 2))! as ToolOutput;
    expect(output.chunk, 'gone');

    final ToolFinished finished =
        read(toolCompleted(toolUseId: 't1', seq: 3, summary: 'removed'))! as ToolFinished;
    expect(finished.status, ToolStatus.succeeded);
    expect(finished.summary, 'removed');
  });

  group('plan 28, B-19 · a tool is read by its kind and label', () {
    ToolInvoked? started(Map<String, Object?> payload) =>
        read(
              frame(
                kind: 'event',
                type: 'tool.started',
                seq: 1,
                payload: <String, Object?>{'toolUseId': 't1', ...payload},
              ),
            )
            as ToolInvoked?;

    test('kind, label, subject and changes as the backend built them', () {
      final ToolCall edit = aToolCall(
        kind: 'file.edit',
        messageKey: 'sessions.tool.fileEdit',
        params: const <String, Object>{'path': 'a.ts', 'added': 2, 'removed': 1},
        subject: const ToolSubject(
          paths: <String>['/w/a.ts'],
          pattern: 'p',
          url: 'u',
          query: 'q',
          server: 's',
          tool: 't',
          description: 'd',
        ),
        changes: const <FileChange>[
          FileChange(path: '/w/a.ts', op: 'edit'),
          FileChange(path: '/w/b.ts', op: 'move', to: '/w/c.ts'),
        ],
        rawInput: const <String, Object?>{'whatever': 1},
      );

      expect(started(toolCallJson(edit))!.call, edit);
    });

    test('no kind, an empty kind or no readable label: nothing to draw it by — unread', () {
      final Map<String, Object?> whole = toolCallJson(shellLs);

      for (final Map<String, Object?> payload in <Map<String, Object?>>[
        <String, Object?>{...whole}..remove('kind'),
        <String, Object?>{...whole, 'kind': ''},
        <String, Object?>{...whole}..remove('label'),
        <String, Object?>{...whole, 'label': 'Shell'},
        <String, Object?>{
          ...whole,
          'label': <String, Object?>{'params': <String, Object?>{}},
        },
        // The engine's own name alone is not enough: the app never draws by it.
        <String, Object?>{'toolName': 'Bash', 'input': <String, Object?>{}},
      ]) {
        expect(
          read(
            frame(
              kind: 'event',
              type: 'tool.started',
              seq: 4,
              payload: <String, Object?>{'toolUseId': 't1', ...payload},
            ),
          ),
          const UnreadEvent(4),
        );
      }
    });

    test('what is missing or out of shape around the label reads as nothing, never a throw', () {
      final ToolInvoked invoked = started(<String, Object?>{
        'kind': 'other',
        'label': <String, Object?>{
          'messageKey': 'sessions.tool.other',
          'params': <String, Object?>{'name': 'X', 'count': 2, 'nested': <String, Object?>{}},
        },
        'subject': <String, Object?>{
          'paths': <Object?>['/a', 3],
          'command': 7,
        },
        'changes': <Object?>[
          'not a change',
          <String, Object?>{'path': '/a'},
          <String, Object?>{'op': 'edit'},
          <String, Object?>{'path': '/b', 'op': 'write'},
        ],
        'rawInput': 'not an object',
      })!;

      expect(invoked.call.label.params, <String, Object>{'name': 'X', 'count': 2});
      expect(invoked.call.subject, const ToolSubject(paths: <String>['/a']));
      expect(invoked.call.changes, const <FileChange>[FileChange(path: '/b', op: 'write')]);
      expect(invoked.call.rawInput, isEmpty);

      final ToolInvoked bare = started(<String, Object?>{
        'kind': 'plan',
        'label': <String, Object?>{'messageKey': 'sessions.tool.plan'},
        'changes': 'none',
      })!;
      expect(
        bare.call,
        aToolCall(kind: 'plan', messageKey: 'sessions.tool.plan', params: const <String, Object>{}),
      );
    });

    test(
      'a kind this build does not know is read all the same — drawing it is the generic line',
      () {
        expect(
          started(
            toolCallJson(aToolCall(kind: 'vcs.commit', messageKey: 'sessions.tool.vcs')),
          )!.call.kind,
          'vcs.commit',
        );
      },
    );
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
    expect(turn.turn.inputTokens, 10);
    expect(turn.turn.outputTokens, 20);

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

  group('plan 26, B-17 · the usage of a turn', () {
    test('S-61 · reads every field the engine reported, cache included', () {
      final TurnFinished turn =
          read(
                turnCompleted(
                  seq: 1,
                  usage: const <String, Object?>{
                    'inputTokens': 100,
                    'outputTokens': 50,
                    'cacheReadTokens': 30,
                    'cacheWriteTokens': 5,
                    'reasoningTokens': 7,
                    'webSearches': 2,
                  },
                ),
              )!
              as TurnFinished;

      expect(turn.turn.inputTokens, 100);
      expect(turn.turn.outputTokens, 50);
      expect(turn.turn.cacheReadTokens, 30);
      expect(turn.turn.cacheWriteTokens, 5);
      expect(turn.turn.reasoningTokens, 7);
      expect(turn.turn.webSearches, 2);
    });

    test('S-62 · a field missing, or not a number, is absent — never zero', () {
      final TurnFinished turn =
          read(
                turnCompleted(
                  seq: 1,
                  usage: const <String, Object?>{'inputTokens': 100, 'outputTokens': '50'},
                ),
              )!
              as TurnFinished;

      expect(turn.turn.inputTokens, 100);
      expect(turn.turn.outputTokens, isNull);
      expect(turn.turn.cacheReadTokens, isNull);
      expect(turn.turn.cacheWriteTokens, isNull);
    });

    test('S-62 · no `usage` object at all is read the same as an empty one', () {
      final TurnFinished turn =
          read(
                frame(
                  kind: 'event',
                  type: 'turn.completed',
                  seq: 1,
                  payload: <String, Object?>{'turnId': 't', 'durationMs': 1000},
                ),
              )!
              as TurnFinished;

      expect(turn.turn.inputTokens, isNull);
      expect(turn.turn.outputTokens, isNull);
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

    test('S-09 · a block kind this build does not know is unread, with the seq', () {
      // A block kind added to the contract later reaches nothing (S-09) — unrelated to who it
      // belongs to.
      final SessionEvent? event = read(
        frame(
          kind: 'event',
          type: 'message.delta',
          seq: 21,
          payload: <String, Object?>{'messageId': 'm', 'delta': 'hm', 'blockType': 'hologram'},
        ),
      );

      expect(event, isA<UnreadEvent>());
      expect(event!.seq, 21);
    });

    group('plan 26, B-18 · a subagent\'s own text and thinking reach it, never dropped', () {
      test('S-63 · message.delta with a parentToolUseId is read, carrying it', () {
        final SessionEvent? event = read(
          frame(
            kind: 'event',
            type: 'message.delta',
            seq: 21,
            payload: <String, Object?>{'messageId': 'm', 'delta': 'x', 'parentToolUseId': 'task'},
          ),
        );

        expect(
          event,
          const MessageFragment(
            21,
            messageId: 'm',
            delta: 'x',
            at: '2026-09-14T12:00:00.000Z',
            parentToolUseId: 'task',
          ),
        );
      });

      test('S-63 · message.completed with a parentToolUseId is read, carrying it', () {
        final SessionEvent? event = read(
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
        );

        expect((event! as MessageFinished).parentToolUseId, 'task');
      });

      test('a thinking fragment with a parentToolUseId is read, carrying it too', () {
        final SessionEvent? event = read(
          frame(
            kind: 'event',
            type: 'message.delta',
            seq: 21,
            payload: <String, Object?>{
              'messageId': 'm',
              'delta': 'hm',
              'blockType': 'thinking',
              'parentToolUseId': 'task',
            },
          ),
        );

        expect(
          event,
          const ThinkingFragment(
            21,
            messageId: 'm',
            delta: 'hm',
            at: '2026-09-14T12:00:00.000Z',
            parentToolUseId: 'task',
          ),
        );
      });

      test('with no parentToolUseId at all, it is still the main conversation\'s own', () {
        final SessionEvent? event = read(
          frame(
            kind: 'event',
            type: 'message.delta',
            seq: 21,
            payload: <String, Object?>{'messageId': 'm', 'delta': 'x'},
          ),
        );

        expect((event! as MessageFragment).parentToolUseId, isNull);
      });
    });

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
              <String, Object?>{'type': 'redactedThinking'},
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
            <String, Object?>{'type': 'toolUse', 'toolUseId': 't1', 'text': 'not this'},
            <String, Object?>{'type': 'toolResult', 'toolUseId': 't1', 'text': 'nor that'},
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
            'permissionMode': 'ask',
            'conversation': conversationJson('conv-1'),
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
                  permissionMode: 'readOnly',
                  correlationId: 'cmd-7',
                  workspacePath: '/home/someone/project',
                ),
              )!
              as SessionOpened;

      expect(opened.model, 'sonnet');
      expect(opened.permissionMode, 'readOnly');
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

  group('plan 13, B-22 · the MCP servers of a session, in an event of its own', () {
    test('S-88 · the whole list, with where each definition came from', () {
      expect(
        read(
          mcpStatusChanged(
            seq: 12,
            servers: <Map<String, Object?>>[
              mcpServerJson(name: 'github', status: 'connected', source: 'ours', toolCount: 3),
              mcpServerJson(name: 'figma', status: 'needs-auth', source: 'plugin'),
            ],
          ),
        ),
        const McpStatusChanged(12, <McpServer>[
          McpServer(
            name: 'github',
            status: McpStatus.connected,
            source: McpSource.ours,
            toolCount: 3,
          ),
          McpServer(name: 'figma', status: McpStatus.needsAuth, source: McpSource.plugin),
        ]),
      );
    });

    test('a failed server carries its redacted error; any other status never does — S-96', () {
      expect(
        read(
          mcpStatusChanged(
            seq: 1,
            servers: <Map<String, Object?>>[
              mcpServerJson(
                name: 'jira',
                status: 'failed',
                error: 'fetch https://jira.example/hook failed',
              ),
              mcpServerJson(name: 'docs', status: 'connected'),
            ],
          ),
        ),
        const McpStatusChanged(1, <McpServer>[
          McpServer(
            name: 'jira',
            status: McpStatus.failed,
            source: McpSource.ours,
            error: 'fetch https://jira.example/hook failed',
          ),
          McpServer(name: 'docs', status: McpStatus.connected, source: McpSource.ours),
        ]),
      );
    });

    test('a source this build does not know is never promoted to ours — S-93', () {
      final SessionEvent? event = read(
        mcpStatusChanged(
          seq: 1,
          servers: <Map<String, Object?>>[
            mcpServerJson(name: 'impostor', status: 'connected', source: 'sdk'),
          ],
        ),
      );

      expect((event! as McpStatusChanged).servers.single.source, McpSource.other);
    });

    test('a server missing a required field is left out; a payload with no list is unread', () {
      expect(
        read(
          frame(
            kind: 'event',
            type: 'session.mcpStatusChanged',
            seq: 2,
            payload: <String, Object?>{
              'servers': <Object?>[
                <String, Object?>{'name': 'kept', 'status': 'connected', 'source': 'ours'},
                <String, Object?>{'status': 'connected'},
                <String, Object?>{'name': 'bad-status', 'status': 'exploded'},
              ],
            },
          ),
        ),
        const McpStatusChanged(2, <McpServer>[
          McpServer(name: 'kept', status: McpStatus.connected, source: McpSource.ours),
        ]),
      );
      expect(
        read(
          frame(
            kind: 'event',
            type: 'session.mcpStatusChanged',
            seq: 3,
            payload: <String, Object?>{},
          ),
        ),
        const UnreadEvent(3),
      );
    });
  });

  group('S-02 · history goes through the same reader as the live frames', () {
    test('a historical message is the event the live one would be, with no seq', () {
      final String raw = messageCompleted(messageId: 'm1', text: 'Hello', seq: 12, role: 'user');

      final SessionEvent historical = historyEventFrom(historyEntry(raw))!;

      expect(
        historical,
        const MessageFinished(
          historySeq,
          messageId: 'm1',
          blocks: <MessageBlock>[TextBlock('Hello')],
          isFromUser: true,
        ),
      );
      expect(historical.seq, 0);
    });

    test('a historical tool and its outcome read as the live ones do', () {
      expect(
        historyEventFrom(historyEntry(toolStarted(toolUseId: 't1', seq: 3))),
        const ToolInvoked(historySeq, toolUseId: 't1', call: shellLs),
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
        toolStarted(
          toolUseId: 't1',
          seq: 1,
          call: tasksCall('sessions.tool.taskCreate', const <String, Object?>{'subject': 'x'}),
          parentToolUseId: 'task-0',
        ),
      );
      expect((started! as ToolInvoked).parentToolUseId, 'task-0');
      expect((read(toolStarted(toolUseId: 't2', seq: 2))! as ToolInvoked).parentToolUseId, isNull);

      // The task the call made is the previous protocol's: the list comes in an event of its own.
      expect(
        read(toolCompleted(toolUseId: 't1', seq: 3, taskId: '7')),
        const ToolFinished(3, toolUseId: 't1', status: ToolStatus.succeeded),
      );
    });
  });

  group('plan 28, B-22 · the task list, in an event of its own', () {
    test('S-66 · the whole list, in the canonical states, the active title when there is one', () {
      expect(
        read(
          sessionTasksChanged(
            seq: 4,
            tasks: <Map<String, Object?>>[
              taskJson('1', 'Read', status: 'completed'),
              taskJson('2', 'Test', status: 'inProgress', activeTitle: 'Testing'),
              taskJson('3', 'Ship'),
            ],
          ),
        ),
        const TasksChanged(4, <SessionTask>[
          SessionTask(id: '1', title: 'Read', status: TaskStatus.completed),
          SessionTask(
            id: '2',
            title: 'Test',
            status: TaskStatus.inProgress,
            activeTitle: 'Testing',
          ),
          SessionTask(id: '3', title: 'Ship', status: TaskStatus.pending),
        ]),
      );
    });

    test('S-66 · an empty list is a list cleared, not nothing', () {
      expect(read(sessionTasksChanged(seq: 5)), const TasksChanged(5, <SessionTask>[]));
    });

    test('a task this build cannot read is left out; a payload with no list is unread', () {
      expect(
        read(
          sessionTasksChanged(
            seq: 6,
            tasks: <Map<String, Object?>>[
              taskJson('1', 'Kept'),
              taskJson('2', 'A state from later', status: 'blocked'),
              <String, Object?>{'id': '3', 'status': 'pending'},
              <String, Object?>{'title': 'No id', 'status': 'pending'},
            ],
          ),
        ),
        const TasksChanged(6, <SessionTask>[
          SessionTask(id: '1', title: 'Kept', status: TaskStatus.pending),
        ]),
      );
      expect(
        read(
          frame(kind: 'event', type: 'session.tasksChanged', seq: 7, payload: <String, Object?>{}),
        ),
        const UnreadEvent(7),
      );
      expect(
        read(
          frame(
            kind: 'event',
            type: 'session.tasksChanged',
            seq: 8,
            payload: <String, Object?>{
              'tasks': <Object?>['nope'],
            },
          ),
        ),
        const TasksChanged(8, <SessionTask>[]),
      );
    });

    test('S-67 · in the history it is read the same way, dated, with no seq of its own', () {
      expect(
        historyEventFrom(
          historyEntry(
            sessionTasksChanged(
              seq: 9,
              at: '2026-09-14T12:00:00.000Z',
              tasks: <Map<String, Object?>>[taskJson('1', 'Read')],
            ),
          ),
        ),
        const TasksChanged(historySeq, <SessionTask>[
          SessionTask(id: '1', title: 'Read', status: TaskStatus.pending),
        ], writtenAt: '2026-09-14T12:00:00.000Z'),
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
            <String, Object?>{'type': 'redactedThinking', 'blockId': 'u1:1'},
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
          blocks: <MessageBlock>[
            TextBlock('A', blockId: 'u1:2'),
            TextBlock('B'),
          ],
          isFromUser: false,
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
          blocks: <MessageBlock>[
            TextBlock('see', blockId: 'u1:0'),
            ImageBlock(PromptImage(blockId: 'u1:1', mediaType: 'image/png', size: 48213)),
            ImageBlock(PromptImage()),
            ImageBlock(PromptImage()),
          ],
          isFromUser: true,
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
      expect(prompt.blocks, const <MessageBlock>[ImageBlock(PromptImage(blockId: 'u1:0'))]);
    });

    test('S-111 · a call says what it is for when the model said; blank or absent is no title', () {
      ToolInvoked started(Object? title) =>
          historyEventFrom(<String, Object?>{
                'type': 'tool.started',
                'payload': <String, Object?>{
                  'toolUseId': 't1',
                  ...toolCallJson(shellCall('pnpm test')),
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

  group('plan 28, F4 · modes, usage and blocks in our names', () {
    String? modeOf(String mode) =>
        (read(sessionStarted(sessionId: 's', permissionMode: mode))! as SessionOpened)
            .permissionMode;

    test('S-82 · a mode of the previous protocol is read as the canonical one, once', () {
      expect(modeOf('default'), 'ask');
      expect(modeOf('plan'), 'readOnly');
      for (final String mode in <String>['ask', 'acceptEdits', 'readOnly', 'allowAll']) {
        expect(modeOf(mode), mode);
      }
    });

    test('S-82 · a mode this build does not know is dropped, never offered', () {
      expect(modeOf('bypassPermissions'), isNull);
      expect(modeOf('dontAsk'), isNull);
    });

    test('S-86 · a turn with no cost and no usage is still a turn — with no cost', () {
      final TurnFinished turn =
          read(turnCompleted(seq: 1, costUsd: null, usage: const <String, Object?>{}))!
              as TurnFinished;

      expect(turn.turn.costUsd, isNull);
      expect(turn.turn.turnId, 'turn-1');
      expect(turn.turn.durationMs, 1200);
    });

    test('S-87 · a cost of zero is zero, not absent', () {
      final TurnFinished turn = read(turnCompleted(seq: 1, costUsd: '0.000000'))! as TurnFinished;

      expect(turn.turn.costUsd, '0.000000');
    });

    test('a turn with no id or no duration is unread, cost or not', () {
      final SessionEvent? noId = read(
        frame(
          kind: 'event',
          type: 'turn.completed',
          seq: 7,
          payload: <String, Object?>{'usage': <String, Object?>{}, 'durationMs': 1},
        ),
      );
      final SessionEvent? noDuration = read(
        frame(
          kind: 'event',
          type: 'turn.completed',
          seq: 8,
          payload: <String, Object?>{'turnId': 't', 'usage': <String, Object?>{}},
        ),
      );

      expect(noId, isA<UnreadEvent>());
      expect(noDuration, isA<UnreadEvent>());
    });

    test('S-88 · redactedThinking, toolUse and toolResult read as the old names did — live and in '
        'the history', () {
      final List<Map<String, Object?>> content = <Map<String, Object?>>[
        <String, Object?>{'type': 'redactedThinking', 'blockId': 'b0'},
        <String, Object?>{'type': 'toolUse', 'toolUseId': 't1', 'text': 'not the answer'},
        <String, Object?>{'type': 'toolResult', 'toolUseId': 't1', 'text': 'nor this'},
        <String, Object?>{'type': 'text', 'text': 'Done.', 'blockId': 'b3'},
      ];
      final MessageFinished live =
          read(messageBlocks(messageId: 'm', seq: 4, content: content))! as MessageFinished;
      final MessageFinished history =
          historyEventFrom(<String, Object?>{
                'type': 'message.completed',
                'payload': <String, Object?>{
                  'messageId': 'm',
                  'role': 'assistant',
                  'content': content,
                },
              })!
              as MessageFinished;

      for (final MessageFinished finished in <MessageFinished>[live, history]) {
        expect(finished.text, 'Done.');
        expect(finished.blocks.map((MessageBlock b) => b.blockId), <String?>['b3']);
        expect(finished.thoughts, const <Thought>[Thought('', isRedacted: true, blockId: 'b0')]);
      }
    });

    test('S-88 · the names of the previous protocol are no blocks of ours any more', () {
      final MessageFinished finished =
          read(
                messageBlocks(
                  messageId: 'm',
                  seq: 4,
                  content: <Map<String, Object?>>[
                    <String, Object?>{'type': 'redacted_thinking'},
                    <String, Object?>{'type': 'text', 'text': 'A'},
                  ],
                ),
              )!
              as MessageFinished;

      expect(finished.thoughts, isEmpty);
      expect(finished.text, 'A');
    });

    test('S-89 · a message with no thinking carries no thought at all', () {
      final MessageFinished finished =
          read(messageCompleted(messageId: 'm', text: 'Hi', seq: 2))! as MessageFinished;

      expect(finished.thoughts, isEmpty);
    });

    test('S-90 · a block of a kind this build does not know does not take the answer with it', () {
      final MessageFinished finished =
          read(
                messageBlocks(
                  messageId: 'm',
                  seq: 4,
                  content: <Map<String, Object?>>[
                    <String, Object?>{'type': 'text', 'text': 'Before. '},
                    <String, Object?>{'type': 'hologram', 'text': 'unknown'},
                    <String, Object?>{'type': 'text', 'text': 'After.'},
                  ],
                ),
              )!
              as MessageFinished;

      expect(finished.text, 'Before. After.');
      expect(finished.thoughts, isEmpty);
    });
  });
}
