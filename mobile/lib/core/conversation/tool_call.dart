/// A call of a tool of the agent, in the words of the canonical contract: its `kind`, the `label`
/// the backend built for it, what it is about and the files it changes (plan 28, B-19).
///
/// Pure Dart, and in `core/` because two features read the same call without knowing each other:
/// the conversation draws it as a row, and the permission card asks about it. Neither decides by
/// the engine's own name for the tool — it is not even kept here: what is drawn comes from [kind]
/// and [label], and [rawInput] is only ever shown whole, as the exact input
/// (docs/architecture/shared/12-engines.md).
library;

import 'package:equatable/equatable.dart';

/// The label of a call: an i18n key of `sessions.tool.*` and the values it interpolates.
class ToolLabel extends Equatable {
  const ToolLabel({required this.messageKey, this.params = const <String, Object>{}});

  /// The key the client translates — `sessions.tool.fileEdit`.
  final String messageKey;

  /// Its values: strings and numbers only.
  final Map<String, Object> params;

  @override
  List<Object?> get props => <Object?>[messageKey, params];
}

/// What a call is about, normalised by the backend. Every field is optional: a kind sets the ones
/// it has.
class ToolSubject extends Equatable {
  const ToolSubject({
    this.paths = const <String>[],
    this.command,
    this.pattern,
    this.url,
    this.query,
    this.server,
    this.tool,
    this.description,
  });

  /// Nothing said about it.
  static const ToolSubject none = ToolSubject();

  /// The files it reads or writes, absolute.
  final List<String> paths;

  /// The whole command line of a `shell` call — what the IN of its row shows.
  final String? command;

  /// What a `search` looks for.
  final String? pattern;

  /// The address a `web.fetch` reads.
  final String? url;

  /// What a `web.search` asks.
  final String? query;

  /// The server and the tool of an `mcp` call.
  final String? server;
  final String? tool;

  /// What an `agent` was sent to do.
  final String? description;

  @override
  List<Object?> get props => <Object?>[
    paths,
    command,
    pattern,
    url,
    query,
    server,
    tool,
    description,
  ];
}

/// One file a call changes, and how: `edit`, `write`, `delete` or `move` (to [to]).
class FileChange extends Equatable {
  const FileChange({required this.path, required this.op, this.to});

  final String path;
  final String op;
  final String? to;

  @override
  List<Object?> get props => <Object?>[path, op, to];
}

/// One call, as the contract carries it.
class ToolCall extends Equatable {
  const ToolCall({
    required this.kind,
    required this.label,
    this.subject = ToolSubject.none,
    this.changes = const <FileChange>[],
    this.rawInput = const <String, Object?>{},
  });

  /// The canonical kind — `file.edit`, `shell`, `agent`… **Open**: one this build does not know is
  /// drawn as the generic line, never as an error.
  final String kind;

  final ToolLabel label;
  final ToolSubject subject;

  /// The files it changes — empty for a kind that changes none.
  final List<FileChange> changes;

  /// Exactly what the tool was asked to do, **opaque**: shown whole as the exact input, and no field
  /// of it is read to decide or to label anything.
  final Map<String, Object?> rawInput;

  @override
  List<Object?> get props => <Object?>[kind, label, subject, changes, rawInput];
}
