import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:logging/logging.dart';
import 'package:remote_claude/core/logging/json_formatter.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/log_entry.dart';

LogContext context() => const LogContext(appVersion: '0.0.1', platform: 'android');

LogRecord record(Level level, Object message, {Object? error}) => LogRecord(
  level,
  '$message',
  'remote_claude',
  error,
  null,
  null,
  message is String ? null : message,
);

Map<String, Object?> decode(String line) => jsonDecode(line)! as Map<String, Object?>;

void main() {
  group('levelName', () {
    test('maps every Dart level to the name the other two ends use', () {
      expect(levelName(Level.FINEST), 'debug');
      expect(levelName(Level.FINE), 'debug');
      expect(levelName(Level.INFO), 'info');
      expect(levelName(Level.WARNING), 'warn');
      expect(levelName(Level.SEVERE), 'error');
      expect(levelName(Level.SHOUT), 'fatal');
    });
  });

  group('redactValue', () {
    test('replaces a credential-shaped field, whatever its case', () {
      final Object? redactedValue = redactValue(<String, Object?>{
        'Authorization': 'Bearer abc',
        'token': 'abc',
        'keep': 'visible',
      });

      expect(redactedValue, <String, Object?>{
        'Authorization': redacted,
        'token': redacted,
        'keep': 'visible',
      });
    });

    test('reaches any depth, including inside a list', () {
      final Object? redactedValue = redactValue(<String, Object?>{
        'client': <String, Object?>{
          'headers': <Object?>[
            <String, Object?>{'cookie': 'session=1'},
          ],
        },
      });

      expect(redactedValue, <String, Object?>{
        'client': <String, Object?>{
          'headers': <Object?>[
            <String, Object?>{'cookie': redacted},
          ],
        },
      });
    });

    test('leaves a scalar alone', () {
      expect(redactValue(42), 42);
      expect(redactValue(null), isNull);
    });
  });

  group('formatRecord', () {
    test('stamps the shared field schema on every line', () {
      final Map<String, Object?> line = decode(
        formatRecord(record(Level.INFO, 'signed in'), context()),
      );

      expect(line['level'], 'info');
      expect(line['msg'], 'signed in');
      expect(line['service'], 'mobile');
      expect(line['appVersion'], '0.0.1');
      expect(line['platform'], 'android');
      expect(line['time'], isA<String>());
    });

    test('carries the structured fields of the entry', () {
      const LogEntry entry = LogEntry('ws frame sent', <String, Object?>{
        'op': 'ws.outbound',
        'seq': 3,
      });

      final Map<String, Object?> line = decode(formatRecord(record(Level.FINE, entry), context()));

      expect(line['op'], 'ws.outbound');
      expect(line['seq'], 3);
    });

    test('never lets a token through', () {
      const LogEntry entry = LogEntry('ws frame sent', <String, Object?>{
        'op': 'ws.outbound',
        'token': 'secret-value',
      });

      final String line = formatRecord(record(Level.FINE, entry), context());

      expect(line, isNot(contains('secret-value')));
      expect(decode(line)['token'], redacted);
    });

    test('truncates a payload above the limit and says so', () {
      final LogEntry entry = LogEntry('http response', <String, Object?>{
        'op': 'http.response',
        'body': 'x' * (maxPayloadBytes + 10),
      });

      final Map<String, Object?> line = decode(formatRecord(record(Level.FINE, entry), context()));

      expect(line['truncated'], isTrue);
      expect((line['payload']! as String).length, maxPayloadBytes);
      expect(line.containsKey('body'), isFalse);
    });

    test('keeps a payload that fits, whole', () {
      const LogEntry entry = LogEntry('http response', <String, Object?>{'body': 'xxxx'});

      final Map<String, Object?> line = decode(formatRecord(record(Level.FINE, entry), context()));

      expect(line['truncated'], isNull);
      expect(line['body'], 'xxxx');
    });

    test('serialises an error next to the message', () {
      final Map<String, Object?> line = decode(
        formatRecord(record(Level.SEVERE, 'boom', error: const FormatException('bad')), context()),
      );

      expect(line['level'], 'error');
      expect(line['err'], contains('bad'));
    });

    test('ignores a message that carries no fields', () {
      final Map<String, Object?> line = decode(formatRecord(record(Level.INFO, 42), context()));

      expect(line['msg'], '42');
    });

    test('includes the optional context fields once they exist', () {
      final LogContext full = context().copyWith(
        sessionId: 'ses-1',
        connectionId: 'conn-1',
        route: '/',
        userId: 'user-1',
        deviceId: 'device-1',
      );

      final Map<String, Object?> line = decode(formatRecord(record(Level.INFO, 'x'), full));

      expect(line['sessionId'], 'ses-1');
      expect(line['connectionId'], 'conn-1');
      expect(line['route'], '/');
      expect(line['userId'], 'user-1');
      expect(line['deviceId'], 'device-1');
    });
  });
}
