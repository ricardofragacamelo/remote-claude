/// Turns a `LogRecord` into one line of JSON with the shared field schema.
///
/// The `logging` package is the Dart team's, and it formats nothing by itself — which is exactly
/// why it was chosen over `logger` and `talker`. Those are built for a readable console; this app
/// needs JSON with fixed field names, because the point is to correlate a phone event with the
/// NestJS log. See docs/architecture/mobile/05-logging.md.
library;

import 'dart:convert';

import 'package:logging/logging.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/log_entry.dart';

/// Largest payload that goes to a log line whole.
const int maxPayloadBytes = 8 * 1024;

/// What replaces a redacted value. Never an omission: a missing field looks like an absent one.
const String redacted = '[REDACTED]';

/// Field names that never reach a log, at any depth.
///
/// Configured here rather than left to whoever writes the call site: a redaction list that
/// depends on people remembering is a redaction list with holes.
const Set<String> redactedFields = <String>{
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'secret',
  'token',
  'accesstoken',
  'refreshtoken',
  'apikey',
  'credential',
  'code',
  'codeverifier',
};

/// The name this project uses for a `Level` of the `logging` package.
///
/// The mapping exists so the three ends agree: `FINE` is `debug` here, in the backend's pino and
/// in the browser.
String levelName(Level level) {
  if (level >= Level.SHOUT) {
    return 'fatal';
  }
  if (level >= Level.SEVERE) {
    return 'error';
  }
  if (level >= Level.WARNING) {
    return 'warn';
  }
  if (level >= Level.INFO) {
    return 'info';
  }
  return 'debug';
}

/// A copy of [fields] with every credential-shaped value replaced, at any depth.
Object? redactValue(Object? value) {
  if (value is Map) {
    return <String, Object?>{
      for (final MapEntry<Object?, Object?> entry in value.entries)
        '${entry.key}': redactedFields.contains('${entry.key}'.toLowerCase())
            ? redacted
            : redactValue(entry.value),
    };
  }

  if (value is List) {
    return value.map(redactValue).toList(growable: false);
  }

  return value;
}

/// One log line, as JSON.
///
/// Attached fields above [maxPayloadBytes] are truncated **and say so**: silently dropping the
/// tail produces a line that looks complete and is not.
String formatRecord(LogRecord record, LogContext context) {
  final Map<String, Object?> fields = <String, Object?>{
    'level': levelName(record.level),
    'time': record.time.toUtc().toIso8601String(),
    'msg': record.message,
    ...context.toFields(),
  };

  final Object? attached = record.object;
  if (attached is LogEntry) {
    final Map<String, Object?> extra = redactValue(attached.fields)! as Map<String, Object?>;
    final String encoded = jsonEncode(extra);

    if (encoded.length > maxPayloadBytes) {
      fields['payload'] = encoded.substring(0, maxPayloadBytes);
      fields['truncated'] = true;
    } else {
      fields.addAll(extra);
    }
  }

  if (record.error != null) {
    fields['err'] = record.error.toString();
  }

  return jsonEncode(fields);
}
