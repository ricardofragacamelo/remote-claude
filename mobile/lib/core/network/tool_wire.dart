/// A tool call on the wire — the canonical fields `tool.started` and `permission.requested` share —
/// read as a [ToolCall] (plan 28, B-19).
///
/// The one reader of that shape, shared by the conversation and the permission card: two readers of
/// the same fields are two chances for one of them to start trusting a field the other checks.
/// Checked by hand rather than with the generated classes: their readers assert the fields, which is
/// right for a frame this app built and wrong for one that arrived from the network.
library;

import 'package:remote_claude/core/conversation/tool_call.dart';

/// The call [payload] describes, or `null` when it names no `kind` or carries no readable `label`:
/// without them there is nothing to draw it by.
ToolCall? toolCallFrom(Map<String, Object?> payload) {
  final Object? kind = payload['kind'];
  final ToolLabel? label = _labelOf(payload['label']);

  if (kind is! String || kind.isEmpty || label == null) {
    return null;
  }

  return ToolCall(
    kind: kind,
    label: label,
    subject: _subjectOf(payload['subject']),
    changes: _changesOf(payload['changes']),
    rawInput: _record(payload['rawInput']) ?? const <String, Object?>{},
  );
}

ToolLabel? _labelOf(Object? value) {
  final Map<String, Object?>? label = _record(value);
  final Object? messageKey = label?['messageKey'];

  if (label == null || messageKey is! String) {
    return null;
  }

  // Strings and numbers only, as the contract says; anything else would be drawn as `Instance of`.
  return ToolLabel(
    messageKey: messageKey,
    params: <String, Object>{
      for (final MapEntry<String, Object?> param
          in (_record(label['params']) ?? const <String, Object?>{}).entries)
        if (param.value case final Object value when value is String || value is num)
          param.key: value,
    },
  );
}

ToolSubject _subjectOf(Object? value) {
  final Map<String, Object?> subject = _record(value) ?? const <String, Object?>{};
  final Object? paths = subject['paths'];

  return ToolSubject(
    paths: paths is List<Object?>
        ? paths.whereType<String>().toList(growable: false)
        : const <String>[],
    command: _text(subject, 'command'),
    pattern: _text(subject, 'pattern'),
    url: _text(subject, 'url'),
    query: _text(subject, 'query'),
    server: _text(subject, 'server'),
    tool: _text(subject, 'tool'),
    description: _text(subject, 'description'),
  );
}

/// The changes a call makes — one without a path or an operation is not one, and is left out.
List<FileChange> _changesOf(Object? value) => <FileChange>[
  if (value is List<Object?>)
    for (final Object? entry in value)
      if (_record(entry) case final Map<String, Object?> change)
        if ((_text(change, 'path'), _text(change, 'op')) case (final String path, final String op))
          FileChange(path: path, op: op, to: _text(change, 'to')),
];

Map<String, Object?>? _record(Object? value) => value is Map<String, Object?> ? value : null;

String? _text(Map<String, Object?> map, String key) {
  final Object? value = map[key];
  return value is String ? value : null;
}
