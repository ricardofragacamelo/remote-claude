/// Reading the answers to a command that are not events: joining a live session, and a refusal.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/network/contracts/frame_codec.dart';
import 'package:remote_claude/core/network/contracts/protocol.g.dart';
import 'package:remote_claude/features/session/data/mappers/command_answer_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';

import '../../../../../support/builders/frames.dart';

Envelope envelope(String raw) => decodeEnvelope(raw)!;

void main() {
  group('joining', () {
    test('S-24 · names the session joined, its conversation and the one it continues', () {
      expect(
        sessionJoinedFrom(
          envelope(sessionAttached(sessionId: 's-1', claudeSessionId: 'c-2', resumedFrom: 'c-1')),
        ),
        const SessionJoined(sessionId: 's-1', claudeSessionId: 'c-2', resumedFrom: 'c-1'),
      );
    });

    test('an ack of a stream that is not a conversation names only the session', () {
      expect(
        sessionJoinedFrom(envelope(sessionAttached(sessionId: 's-1'))),
        const SessionJoined(sessionId: 's-1'),
      );
    });

    test('anything else is not a join', () {
      expect(sessionJoinedFrom(envelope(frame(kind: 'ack', type: 'command.accepted'))), isNull);
      expect(sessionJoinedFrom(envelope(frame(kind: 'ack', type: 'session.attached'))), isNull);
      expect(
        sessionJoinedFrom(
          envelope(
            frame(
              kind: 'ack',
              type: 'session.attached',
              payload: <String, Object?>{'sessionId': 3},
            ),
          ),
        ),
        isNull,
      );
    });
  });

  group('refusing', () {
    test('B-13 · carries the command it refuses and the failure, as HTTP would', () {
      final CommandRefused refused = commandRefusedFrom(
        envelope(
          commandError(
            correlationId: 'cmd-1',
            code: 'WORKSPACE_NOT_ALLOWED',
            messageKey: 'workspace.error.notAllowed',
            params: <String, Object?>{'path': '/etc'},
          ),
        ),
      )!;

      expect(refused.commandId, 'cmd-1');
      expect(
        refused.failure,
        const ServerFailure(
          code: 'WORKSPACE_NOT_ALLOWED',
          messageKey: 'workspace.error.notAllowed',
          traceId: 'trace-1',
          params: <String, String>{'path': '/etc'},
        ),
      );
    });

    test('a refusal with no readable payload is still a failure, traced by the frame', () {
      final CommandRefused refused = commandRefusedFrom(
        envelope(
          '{"v":1,"id":"err-9","kind":"error","type":"error","ts":"2026-09-14T12:00:00.000Z",'
          '"correlationId":"cmd-1","traceId":"trace-frame"}',
        ),
      )!;

      expect(refused.failure, const UnexpectedFailure(traceId: 'trace-frame'));
    });

    test('with no trace anywhere, the frame id stands in for one', () {
      final CommandRefused refused = commandRefusedFrom(
        envelope(
          '{"v":1,"id":"err-9","kind":"error","type":"error","ts":"2026-09-14T12:00:00.000Z",'
          '"correlationId":"cmd-1"}',
        ),
      )!;

      expect(refused.failure.traceId, 'err-9');
    });

    test('an error that names no command, or a frame that is not an error, is nobody’s', () {
      expect(commandRefusedFrom(envelope(commandError(correlationId: null))), isNull);
      expect(commandRefusedFrom(envelope(sessionAttached(sessionId: 's-1'))), isNull);
    });
  });

  group('a failure the session reports', () {
    test('S-44 · an error naming no command is the session speaking, with its params', () {
      final SessionFailed? failed = sessionFailedFrom(
        envelope(
          commandError(
            correlationId: null,
            code: 'INTERNAL_ERROR',
            messageKey: 'session.error.rewindIncomplete',
            params: <String, Object?>{'failed': 2},
          ),
        ),
      );

      expect(failed?.failure.code, 'INTERNAL_ERROR');
      expect(failed?.failure.params, <String, String>{'failed': '2'});
    });

    test('a refusal of a command, or a frame that is not an error, is not one', () {
      expect(sessionFailedFrom(envelope(commandError(correlationId: 'cmd-1'))), isNull);
      expect(sessionFailedFrom(envelope(sessionAttached(sessionId: 's-1'))), isNull);
    });
  });
}
