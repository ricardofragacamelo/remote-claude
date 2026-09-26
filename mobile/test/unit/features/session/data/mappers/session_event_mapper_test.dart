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

/// The event carried by one line of wire text.
SessionEvent? read(String raw) => sessionEventFrom(decodeEnvelope(raw)!);

void main() {
  test('a session opening names the session it opened', () {
    final SessionEvent? event = read(sessionStarted(sessionId: 'session-1'));

    expect(event, isA<SessionOpened>());
    expect((event! as SessionOpened).sessionId, 'session-1');
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
}
