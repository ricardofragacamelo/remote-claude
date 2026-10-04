/// The task list Claude keeps, read from the calls of its tools (plan 10, B-23) — the same reading the
/// web does (`web/src/features/session/lib/task-list.ts`): the whole list of each `TodoWrite`, or the
/// `TaskCreate`/`TaskUpdate` one at a time, by the **name of the tool**, never by the model. The same
/// calls come from the stream and from the history, so a reload draws the same list.
///
/// Pure Dart: every rule is a function of the calls.
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/features/session/domain/entities/conversation_entry.dart';

/// Where a task of the list is.
enum TaskState { pending, inProgress, completed }

/// One task of the list.
class TaskItem extends Equatable {
  const TaskItem({
    required this.key,
    required this.title,
    required this.activeForm,
    required this.state,
    this.id,
  });

  /// What the list knows it by — the task's id, or the call that made it, or its text.
  final String key;

  /// The id of a `Task*` task — `null` for a `TodoWrite` item, and for a creation not ended yet.
  final String? id;
  final String title;

  /// What is said of it while it is in progress — "Running the tests".
  final String activeForm;
  final TaskState state;

  TaskItem _with({String? title, String? activeForm, TaskState? state}) => TaskItem(
    key: key,
    id: id,
    title: title ?? this.title,
    activeForm: activeForm ?? this.activeForm,
    state: state ?? this.state,
  );

  @override
  List<Object?> get props => <Object?>[key, id, title, activeForm, state];
}

/// The states as the CLI writes them.
const Map<String, TaskState> _states = <String, TaskState>{
  'pending': TaskState.pending,
  'in_progress': TaskState.inProgress,
  'completed': TaskState.completed,
};

/// The list after one call, or `null` when the call is not one the list can read.
typedef _Step = List<TaskItem>? Function(List<TaskItem> items, ToolExecution tool);

const Map<String, _Step> _steps = <String, _Step>{
  'TodoWrite': _todoWrite,
  'TaskCreate': _taskCreate,
  'TaskUpdate': _taskUpdate,
};

/// The task list of a conversation, from its tools in order.
///
/// Only the main conversation: a subagent's list is its own. A call that failed or was refused
/// changed nothing.
List<TaskItem> taskListOf(Iterable<ToolExecution> tools) {
  List<TaskItem> items = const <TaskItem>[];

  for (final ToolExecution tool in tools) {
    final _Step? step = _steps[tool.toolName];
    final bool counts =
        !tool.isSubagent && tool.status != ToolStatus.failed && tool.status != ToolStatus.denied;

    items = (counts ? step?.call(items, tool) : null) ?? items;
  }

  return items;
}

/// A text of [input], or `null` when it is absent or of another type.
String? _text(Map<String, Object?> input, String name) {
  final Object? value = input[name];
  return value is String ? value : null;
}

/// A `TodoWrite`: the whole list, every time — an empty one clears it.
List<TaskItem>? _todoWrite(List<TaskItem> items, ToolExecution tool) {
  final Object? todos = tool.input['todos'];

  if (todos is! List<Object?>) {
    return null;
  }

  final List<TaskItem?> next = todos.map(_todoOf).toList(growable: false);

  return next.contains(null) ? null : next.whereType<TaskItem>().toList(growable: false);
}

/// One item of a `TodoWrite`, or `null` when it is out of the format.
TaskItem? _todoOf(Object? todo) {
  if (todo is! Map<String, Object?>) {
    return null;
  }

  final String? content = _text(todo, 'content');
  final TaskState? state = _states[todo['status']];

  if (content == null || state == null) {
    return null;
  }

  return TaskItem(
    key: 'todo:$content',
    title: content,
    activeForm: _text(todo, 'activeForm') ?? content,
    state: state,
  );
}

/// A `TaskCreate`: one task more, pending — its id is known once the call ended.
List<TaskItem>? _taskCreate(List<TaskItem> items, ToolExecution tool) {
  final String? subject = _text(tool.input, 'subject');

  if (subject == null) {
    return null;
  }

  return <TaskItem>[
    ...items,
    TaskItem(
      key: tool.taskId ?? tool.toolUseId,
      id: tool.taskId,
      title: subject,
      activeForm: _text(tool.input, 'activeForm') ?? subject,
      state: TaskState.pending,
    ),
  ];
}

/// A `TaskUpdate`: one task changed, or taken out with `deleted` — by its id, never its place.
List<TaskItem>? _taskUpdate(List<TaskItem> items, ToolExecution tool) {
  final String? taskId = _text(tool.input, 'taskId');
  final Object? status = tool.input['status'];
  final bool known = items.any((TaskItem item) => item.id != null && item.id == taskId);

  if (taskId == null ||
      !known ||
      (status != null && status != 'deleted' && !_states.containsKey(status))) {
    return null;
  }

  return <TaskItem>[
    for (final TaskItem item in items)
      if (item.id != taskId)
        item
      else if (status != 'deleted')
        item._with(
          title: _text(tool.input, 'subject'),
          activeForm: _text(tool.input, 'activeForm'),
          state: _states[status],
        ),
  ];
}
