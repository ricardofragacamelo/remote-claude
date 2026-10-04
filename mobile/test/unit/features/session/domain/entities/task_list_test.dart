/// The task list Claude keeps, read from its tools (plan 10, B-23): the same reading as the web's.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/task_list.dart';

ToolExecution todo(String id, List<Object?> todos, {ToolStatus status = ToolStatus.succeeded}) =>
    ToolExecution(
      toolUseId: id,
      toolName: 'TodoWrite',
      input: <String, Object?>{'todos': todos},
      status: status,
    );

Map<String, Object?> item(String content, String status, {String? activeForm}) => <String, Object?>{
  'content': content,
  'status': status,
  'activeForm': ?activeForm,
};

void main() {
  group('TodoWrite', () {
    test('S-77 · the whole list, every time — the last one wins', () {
      final List<TaskItem> items = taskListOf(<ToolExecution>[
        todo('t1', <Object?>[item('Read', 'pending')]),
        todo('t2', <Object?>[
          item('Read', 'completed'),
          item('Test', 'in_progress', activeForm: 'Testing'),
        ]),
      ]);

      expect(items.map((TaskItem each) => each.state), <TaskState>[
        TaskState.completed,
        TaskState.inProgress,
      ]);
      expect(items.last.activeForm, 'Testing');
      expect(items.first.activeForm, 'Read');
      expect(items.first.key, 'todo:Read');
    });

    test('S-77 · an empty list clears it; none at all is no list', () {
      expect(taskListOf(const <ToolExecution>[]), isEmpty);
      expect(
        taskListOf(<ToolExecution>[
          todo('t1', <Object?>[item('Read', 'pending')]),
          todo('t2', const <Object?>[]),
        ]),
        isEmpty,
      );
    });

    test('a call out of the format, failed, refused or of a subagent changes nothing', () {
      final ToolExecution first = todo('t1', <Object?>[item('Read', 'pending')]);

      for (final ToolExecution ignored in <ToolExecution>[
        todo('t2', <Object?>[item('Read', 'nonsense')]),
        todo('t3', <Object?>['not a map']),
        todo('t4', <Object?>[
          <String, Object?>{'status': 'pending'},
        ]),
        const ToolExecution(toolUseId: 't5', toolName: 'TodoWrite', input: <String, Object?>{}),
        todo('t6', const <Object?>[], status: ToolStatus.failed),
        todo('t7', const <Object?>[], status: ToolStatus.denied),
        const ToolExecution(
          toolUseId: 't8',
          toolName: 'TodoWrite',
          input: <String, Object?>{'todos': <Object?>[]},
          isSubagent: true,
        ),
        const ToolExecution(toolUseId: 't9', toolName: 'Bash', input: <String, Object?>{}),
      ]) {
        expect(
          taskListOf(<ToolExecution>[first, ignored]),
          hasLength(1),
          reason: ignored.toolUseId,
        );
      }
    });
  });

  group('TaskCreate and TaskUpdate', () {
    const ToolExecution create = ToolExecution(
      toolUseId: 'c1',
      toolName: 'TaskCreate',
      input: <String, Object?>{'subject': 'Write the docs', 'activeForm': 'Writing the docs'},
      status: ToolStatus.succeeded,
      taskId: '7',
    );

    ToolExecution update(Map<String, Object?> input) => ToolExecution(
      toolUseId: 'u-${input.hashCode}',
      toolName: 'TaskUpdate',
      input: input,
      status: ToolStatus.succeeded,
    );

    test('a task created is pending, known by its id once the call ended', () {
      final List<TaskItem> items = taskListOf(<ToolExecution>[create]);

      expect(items.single.key, '7');
      expect(items.single.id, '7');
      expect(items.single.state, TaskState.pending);
    });

    test('a creation not ended yet is known by its call', () {
      final List<TaskItem> items = taskListOf(<ToolExecution>[
        const ToolExecution(
          toolUseId: 'c2',
          toolName: 'TaskCreate',
          input: <String, Object?>{'subject': 'Plan'},
        ),
      ]);

      expect(items.single.key, 'c2');
      expect(items.single.activeForm, 'Plan');
    });

    test('an update moves its task by id, and can rename it; deleted takes it out', () {
      final List<TaskItem> moved = taskListOf(<ToolExecution>[
        create,
        update(<String, Object?>{'taskId': '7', 'status': 'in_progress', 'subject': 'Docs'}),
      ]);
      expect(moved.single.state, TaskState.inProgress);
      expect(moved.single.title, 'Docs');

      final List<TaskItem> kept = taskListOf(<ToolExecution>[
        create,
        update(<String, Object?>{'taskId': '7'}),
      ]);
      expect(kept.single.state, TaskState.pending);

      expect(
        taskListOf(<ToolExecution>[
          create,
          update(<String, Object?>{'taskId': '7', 'status': 'deleted'}),
        ]),
        isEmpty,
      );
    });

    test('an update of a task the list does not have, or out of the format, changes nothing', () {
      for (final Map<String, Object?> input in <Map<String, Object?>>[
        <String, Object?>{'taskId': '99', 'status': 'completed'},
        <String, Object?>{'status': 'completed'},
        <String, Object?>{'taskId': '7', 'status': 'nonsense'},
      ]) {
        expect(taskListOf(<ToolExecution>[create, update(input)]).single.state, TaskState.pending);
      }
      expect(
        taskListOf(<ToolExecution>[
          const ToolExecution(toolUseId: 'c3', toolName: 'TaskCreate', input: <String, Object?>{}),
        ]),
        isEmpty,
      );
    });

    test('items compare by value', () {
      expect(
        const TaskItem(key: 'k', title: 't', activeForm: 'a', state: TaskState.pending),
        const TaskItem(key: 'k', title: 't', activeForm: 'a', state: TaskState.pending),
      );
    });
  });
}
