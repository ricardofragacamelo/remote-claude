/// Reads the answer of the route of a tool's whole output as a [ToolOutput].
library;

import 'package:remote_claude/features/session/domain/entities/transcript_content.dart';

/// The output in [body], read defensively: a field that is not what it says is not there, and a
/// cut that does not fall inside the text is not marked.
ToolOutput toolOutputFrom(Object? body) {
  final Map<String, Object?> record = body is Map<String, Object?>
      ? body
      : const <String, Object?>{};
  final Object? text = record['text'];
  final String said = text is String ? text : '';
  final int? cutAt = _count(record['cutAt']);

  return ToolOutput(
    text: said,
    truncated: record['truncated'] == true,
    bytes: _count(record['bytes']) ?? said.length,
    cutAt: cutAt != null && cutAt <= said.length ? cutAt : null,
  );
}

/// A whole, non-negative number, or `null`.
int? _count(Object? value) => value is int && value >= 0 ? value : null;
