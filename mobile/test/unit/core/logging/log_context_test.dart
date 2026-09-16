import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/log_entry.dart';
import 'package:remote_claude/core/logging/log_operations.dart';

void main() {
  group('LogContext', () {
    const LogContext base = LogContext(appVersion: '0.0.1', platform: 'iOS');

    test('leaves out the fields that do not exist yet', () {
      expect(base.toFields().keys, <String>['service', 'appVersion', 'platform']);
    });

    test('copyWith keeps what it was not given', () {
      final LogContext next = base.copyWith(sessionId: 'ses-1').copyWith(route: '/');

      expect(next.sessionId, 'ses-1');
      expect(next.route, '/');
      expect(next.appVersion, '0.0.1');
    });

    test('two contexts with the same fields are equal', () {
      expect(base.copyWith(userId: 'u'), base.copyWith(userId: 'u'));
    });
  });

  group('LogEntry', () {
    test('reads as its message, so the record carries a readable one', () {
      expect(const LogEntry('ws frame sent', <String, Object?>{}).toString(), 'ws frame sent');
    });
  });

  group('LogOp', () {
    test('names every I/O edge the app has', () {
      expect(
        <String>[
          LogOp.httpRequest,
          LogOp.httpResponse,
          LogOp.wsInbound,
          LogOp.wsOutbound,
          LogOp.wsConnection,
          LogOp.authToken,
          LogOp.lifecycleChanged,
        ],
        <String>[
          'http.request',
          'http.response',
          'ws.inbound',
          'ws.outbound',
          'ws.connection',
          'auth.token',
          'lifecycle.changed',
        ],
      );
    });
  });
}
