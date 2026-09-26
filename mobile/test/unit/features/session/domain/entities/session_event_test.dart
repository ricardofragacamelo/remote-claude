/// The events a session is made of, compared by value.
///
/// Not ceremony: these travel on a broadcast stream that two screens listen to, and a replay
/// re-delivers them. Equality is how a test — and a widget rebuilding — can tell "the same thing
/// arrived again" from "something else happened".
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/pong.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';

/// Not `const` anywhere below: two identical constant expressions are one instance, and identity
/// would answer before the equality these tests are about.
// ignore_for_file: prefer_const_constructors
void main() {
  Pong pong({String nonce = 'n-1'}) => Pong(
    seq: 1,
    sessionId: 'session-1',
    pingedAt: '2026-09-20T12:00:00.000Z',
    pingCount: 1,
    nonce: nonce,
  );

  test('two of the same event are the same event', () {
    expect(SessionOpened(1, 's'), SessionOpened(1, 's'));
    expect(
      SessionStatusReported(1, SessionStatus.idle),
      SessionStatusReported(1, SessionStatus.idle),
    );
    expect(
      MessageFragment(1, messageId: 'm', delta: 'a'),
      MessageFragment(1, messageId: 'm', delta: 'a'),
    );
    expect(
      MessageFinished(1, messageId: 'm', text: 'a', isFromUser: false),
      MessageFinished(1, messageId: 'm', text: 'a', isFromUser: false),
    );
    expect(
      ToolInvoked(1, toolUseId: 't', toolName: 'Bash', input: <String, Object?>{}),
      ToolInvoked(1, toolUseId: 't', toolName: 'Bash', input: <String, Object?>{}),
    );
    expect(ToolOutput(1, toolUseId: 't', chunk: 'x'), ToolOutput(1, toolUseId: 't', chunk: 'x'));
    expect(
      ToolFinished(1, toolUseId: 't', status: ToolStatus.failed),
      ToolFinished(1, toolUseId: 't', status: ToolStatus.failed),
    );
    expect(
      TurnFinished(1, TurnSummary(turnId: 't', costUsd: '0.1', durationMs: 2)),
      TurnFinished(1, TurnSummary(turnId: 't', costUsd: '0.1', durationMs: 2)),
    );
    expect(
      SessionFinished(1, SessionEnding(reason: SessionCloseReason.failed, at: 'now')),
      SessionFinished(1, SessionEnding(reason: SessionCloseReason.failed, at: 'now')),
    );
    expect(PongArrived(1, pong()), PongArrived(1, pong()));
    expect(UnreadEvent(1), UnreadEvent(1));
  });

  test('a different event, or the same one at a different place in the order, is not equal', () {
    expect(SessionOpened(1, 's'), isNot(SessionOpened(1, 'other')));
    expect(SessionOpened(1, 's'), isNot(SessionOpened(2, 's')));
    expect(
      SessionStatusReported(1, SessionStatus.idle),
      isNot(SessionStatusReported(1, SessionStatus.running)),
    );
    expect(
      MessageFragment(1, messageId: 'm', delta: 'a'),
      isNot(MessageFragment(1, messageId: 'm', delta: 'b')),
    );
    expect(
      MessageFinished(1, messageId: 'm', text: 'a', isFromUser: false),
      isNot(MessageFinished(1, messageId: 'm', text: 'a', isFromUser: true)),
    );
    expect(
      ToolInvoked(1, toolUseId: 't', toolName: 'Bash', input: <String, Object?>{}),
      isNot(ToolInvoked(1, toolUseId: 't', toolName: 'Read', input: <String, Object?>{})),
    );
    expect(
      ToolOutput(1, toolUseId: 't', chunk: 'x'),
      isNot(ToolOutput(1, toolUseId: 't', chunk: 'y')),
    );
    expect(
      ToolFinished(1, toolUseId: 't', status: ToolStatus.failed),
      isNot(ToolFinished(1, toolUseId: 't', status: ToolStatus.denied)),
    );
    expect(
      TurnFinished(1, TurnSummary(turnId: 't', costUsd: '0.1', durationMs: 2)),
      isNot(TurnFinished(1, TurnSummary(turnId: 't', costUsd: '0.2', durationMs: 2))),
    );
    expect(
      SessionFinished(1, SessionEnding(reason: SessionCloseReason.failed, at: 'now')),
      isNot(SessionFinished(1, SessionEnding(reason: SessionCloseReason.shutdown, at: 'now'))),
    );
    expect(PongArrived(1, pong()), isNot(PongArrived(1, pong(nonce: 'n-2'))));
    expect(UnreadEvent(1), isNot(UnreadEvent(2)));
  });

  test('every event says where it sits in the order', () {
    final List<SessionEvent> events = <SessionEvent>[
      SessionOpened(7, 's'),
      SessionStatusReported(7, SessionStatus.idle),
      MessageFragment(7, messageId: 'm', delta: 'a'),
      MessageFinished(7, messageId: 'm', text: 'a', isFromUser: false),
      ToolInvoked(7, toolUseId: 't', toolName: 'Bash', input: <String, Object?>{}),
      ToolOutput(7, toolUseId: 't', chunk: 'x'),
      ToolFinished(7, toolUseId: 't', status: ToolStatus.succeeded),
      TurnFinished(7, TurnSummary(turnId: 't', costUsd: '0.1', durationMs: 2)),
      SessionFinished(7, SessionEnding(reason: SessionCloseReason.completed, at: 'now')),
      PongArrived(7, pong()),
      UnreadEvent(7),
    ];

    // The resume point is read off whichever event arrived, so every one of them has to carry it.
    for (final SessionEvent event in events) {
      expect(event.seq, 7, reason: '${event.runtimeType}');
    }
  });
}
