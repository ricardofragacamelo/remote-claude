/// A message with its structured fields.
///
/// `package:logging` carries one message per record, and exposes the original object whenever
/// that message was not a `String`. Passing an entry is therefore how structured fields reach the
/// formatter without a second logging API next to the Dart team's one: `toString()` answers the
/// human-readable message, and `fields` is what becomes JSON.
library;

/// One log line before it is formatted.
class LogEntry {
  const LogEntry(this.message, this.fields);

  /// In English, lowercase, with no interpolated data — the data belongs in [fields].
  final String message;

  /// Structured fields of this line, `op` among them.
  final Map<String, Object?> fields;

  @override
  String toString() => message;
}
