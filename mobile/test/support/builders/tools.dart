/// Tool calls as the canonical contract carries them — kind, label, subject, changes and the exact
/// input —, built for a test (plan 28, B-19).
library;

import 'package:remote_claude/core/conversation/tool_call.dart';

/// A shell `ls` — what [shellCall] builds with no command —, usable where a constant is needed.
const ToolCall shellLs = ToolCall(
  kind: 'shell',
  label: ToolLabel(messageKey: 'sessions.tool.shell', params: <String, Object>{'command': 'ls'}),
  subject: ToolSubject(command: 'ls'),
  rawInput: <String, Object?>{'command': 'ls'},
);

/// A read of `a.txt` — what [readCall] builds by default —, usable where a constant is needed.
const ToolCall readA = ToolCall(
  kind: 'file.read',
  label: ToolLabel(messageKey: 'sessions.tool.fileRead', params: <String, Object>{'path': 'a.txt'}),
  subject: ToolSubject(paths: <String>['/w/a.txt']),
  rawInput: <String, Object?>{'file_path': '/w/a.txt'},
);

/// A call of [kind] labelled by [messageKey] with [params].
ToolCall aToolCall({
  String kind = 'other',
  String messageKey = 'sessions.tool.other',
  Map<String, Object> params = const <String, Object>{'name': 'Custom'},
  ToolSubject subject = ToolSubject.none,
  List<FileChange> changes = const <FileChange>[],
  Map<String, Object?> rawInput = const <String, Object?>{},
}) => ToolCall(
  kind: kind,
  label: ToolLabel(messageKey: messageKey, params: params),
  subject: subject,
  changes: changes,
  rawInput: rawInput,
);

/// A shell command — [command] whole in the subject, its first line in the label.
ToolCall shellCall([String command = 'ls']) => aToolCall(
  kind: 'shell',
  messageKey: 'sessions.tool.shell',
  params: <String, Object>{'command': command.split('\n').first},
  subject: ToolSubject(command: command),
  rawInput: <String, Object?>{'command': command},
);

/// A read of [path], relative to the folder in the label.
ToolCall readCall({
  String path = 'a.txt',
  Map<String, Object?> rawInput = const <String, Object?>{'file_path': '/w/a.txt'},
}) => aToolCall(
  kind: 'file.read',
  messageKey: 'sessions.tool.fileRead',
  params: <String, Object>{'path': path},
  subject: ToolSubject(paths: <String>['/w/$path']),
  rawInput: rawInput,
);

/// A question of the agent — [count] questions.
ToolCall questionCall({int count = 0, Map<String, Object?> rawInput = const <String, Object?>{}}) =>
    aToolCall(
      kind: 'question',
      messageKey: 'sessions.tool.questions',
      params: <String, Object>{'count': count},
      rawInput: rawInput,
    );

/// The plan presented — its text travels in the request's `interaction`, never read from here (plan
/// 28, B-20); [rawInput] is only what the card would show whole.
ToolCall planCall({Map<String, Object?> rawInput = const <String, Object?>{}}) => aToolCall(
  kind: 'plan',
  messageKey: 'sessions.tool.plan',
  params: const <String, Object>{},
  rawInput: rawInput,
);

/// A call of kind `tasks`, labelled [messageKey] — `sessions.tool.tasksWrite`, `.taskCreate`… —, with
/// [rawInput] as the list or the task.
ToolCall tasksCall(String messageKey, Map<String, Object?> rawInput) => aToolCall(
  kind: 'tasks',
  messageKey: messageKey,
  params: const <String, Object>{},
  rawInput: rawInput,
);

/// An MCP tool, by its server and its tool.
ToolCall mcpCall({String server = 'github', String tool = 'create_issue'}) => aToolCall(
  kind: 'mcp',
  messageKey: 'sessions.tool.mcp',
  params: <String, Object>{'server': server, 'tool': tool},
  subject: ToolSubject(server: server, tool: tool),
);

/// A subagent sent to do [description].
ToolCall agentCall({String description = 'Explore', String type = 'general-purpose'}) => aToolCall(
  kind: 'agent',
  messageKey: 'sessions.tool.agent',
  params: <String, Object>{'type': type, 'description': description},
  subject: ToolSubject(description: description),
);

/// [call] as the wire writes it, the fields `tool.started` and `permission.requested` share.
Map<String, Object?> toolCallJson(ToolCall call, {String native = 'NativeTool'}) =>
    <String, Object?>{
      'kind': call.kind,
      'label': <String, Object?>{'messageKey': call.label.messageKey, 'params': call.label.params},
      'subject': <String, Object?>{
        if (call.subject.paths.isNotEmpty) 'paths': call.subject.paths,
        'command': ?call.subject.command,
        'pattern': ?call.subject.pattern,
        'url': ?call.subject.url,
        'query': ?call.subject.query,
        'server': ?call.subject.server,
        'tool': ?call.subject.tool,
        'description': ?call.subject.description,
      },
      'changes': <Object?>[
        for (final FileChange change in call.changes)
          <String, Object?>{'path': change.path, 'op': change.op, 'to': ?change.to},
      ],
      'origin': <String, Object?>{'engine': 'engine-a', 'native': native},
      'rawInput': call.rawInput,
    };
