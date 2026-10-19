/// The words of a tool call's row: the label the backend built, translated by the keys the web
/// shares with the app — the same text on both ends (plan 28, B-19).
library;

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/conversation/tool_call.dart';
import 'package:remote_claude/core/widgets/tool_label_words.dart';
import 'package:remote_claude/features/session/presentation/widgets/tool_label.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/builders/tools.dart';
import '../../../support/pump_app.dart';

/// A label of [messageKey] with [params].
ToolLabel label(String messageKey, [Map<String, Object> params = const <String, Object>{}]) =>
    ToolLabel(messageKey: messageKey, params: params);

/// Every key the backend builds, a call of it, and the words the web says for it (en, pt-BR) —
/// the texts of the pairs in `scripts/i18n-shared.json`.
final List<(String kind, ToolLabel label, String en, String pt)> every =
    <(String, ToolLabel, String, String)>[
      (
        'file.read',
        label('sessions.tool.fileRead', <String, Object>{'path': 'src/a.ts'}),
        'Read src/a.ts',
        'Ler src/a.ts',
      ),
      (
        'file.edit',
        label('sessions.tool.fileEdit', <String, Object>{'path': 'a.ts', 'added': 3, 'removed': 1}),
        'Edit a.ts (+3 −1)',
        'Editar a.ts (+3 −1)',
      ),
      (
        'file.edit',
        label('sessions.tool.fileEditMany', <String, Object>{'path': 'a.ts'}),
        'Edit a.ts (several changes)',
        'Editar a.ts (várias mudanças)',
      ),
      (
        'file.edit',
        label('sessions.tool.fileEditCell', <String, Object>{'path': 'n.ipynb'}),
        'Edit the notebook n.ipynb',
        'Editar o notebook n.ipynb',
      ),
      (
        'file.write',
        label('sessions.tool.fileWrite', <String, Object>{'path': 'b.md', 'lines': 12}),
        'Write b.md (12 lines)',
        'Gravar b.md (12 linhas)',
      ),
      (
        'shell',
        label('sessions.tool.shell', <String, Object>{'command': 'npm test'}),
        'Shell: npm test',
        'Shell: npm test',
      ),
      (
        'shell.output',
        label('sessions.tool.shellOutput'),
        'Read the output of a command',
        'Ler a saída de um comando',
      ),
      (
        'search',
        label('sessions.tool.search', <String, Object>{'pattern': 'TODO'}),
        'Search for “TODO”',
        'Buscar “TODO”',
      ),
      (
        'search',
        label('sessions.tool.searchIn', <String, Object>{'pattern': 'TODO', 'path': 'src'}),
        'Search for “TODO” in src',
        'Buscar “TODO” em src',
      ),
      (
        'search',
        label('sessions.tool.searchFiles', <String, Object>{'pattern': '**/*.ts'}),
        'Find files **/*.ts',
        'Achar arquivos **/*.ts',
      ),
      (
        'web.fetch',
        label('sessions.tool.webFetch', <String, Object>{'host': 'example.com'}),
        'Fetch example.com',
        'Buscar example.com',
      ),
      (
        'web.search',
        label('sessions.tool.webSearch', <String, Object>{'query': 'dart 3'}),
        'Search the web for “dart 3”',
        'Pesquisar na web “dart 3”',
      ),
      (
        'agent',
        label('sessions.tool.agent', <String, Object>{'type': 'Explore', 'description': 'Map it'}),
        'Subagent (Explore): Map it',
        'Subagente (Explore): Map it',
      ),
      (
        'question',
        label('sessions.tool.question', <String, Object>{'header': 'Tone'}),
        'Asked: Tone',
        'Perguntou: Tone',
      ),
      (
        'question',
        label('sessions.tool.questions', <String, Object>{'count': 3}),
        'Asked 3 questions',
        'Fez 3 perguntas',
      ),
      ('plan', label('sessions.tool.plan'), 'Present the plan', 'Apresentar o plano'),
      (
        'tasks',
        label('sessions.tool.tasksWrite', <String, Object>{'count': 4}),
        'Updated the task list (4 tasks)',
        'Atualizou a lista de tarefas (4 tarefas)',
      ),
      (
        'tasks',
        label('sessions.tool.taskCreate', <String, Object>{'subject': 'Ship'}),
        'Added a task: Ship',
        'Adicionou uma tarefa: Ship',
      ),
      (
        'tasks',
        label('sessions.tool.taskUpdate', <String, Object>{'id': '7'}),
        'Changed task #7',
        'Mudou a tarefa #7',
      ),
      (
        'tasks',
        label('sessions.tool.taskGet', <String, Object>{'id': '7'}),
        'Read task #7',
        'Leu a tarefa #7',
      ),
      ('tasks', label('sessions.tool.taskList'), 'Read the task list', 'Leu a lista de tarefas'),
      (
        'mcp',
        label('sessions.tool.mcp', <String, Object>{'server': 'github', 'tool': 'create_issue'}),
        'github · create_issue',
        'github · create_issue',
      ),
      (
        'other',
        label('sessions.tool.other', <String, Object>{'name': 'Workflow'}),
        'Workflow',
        'Workflow',
      ),
    ];

void main() {
  late AppLocalizations en;
  late AppLocalizations pt;

  setUpAll(() async {
    en = await englishCatalogue();
    pt = await AppLocalizations.delegate.load(const Locale('pt'));
  });

  group('S-58 · the same words as the web, by the shared keys', () {
    test('every key the backend builds, in en and in pt-BR', () {
      for (final (String kind, ToolLabel label, String english, String portuguese) in every) {
        expect(
          toolLabelText(en, kind: kind, label: label),
          english,
          reason: label.messageKey,
        );
        expect(
          toolLabelText(pt, kind: kind, label: label),
          portuguese,
          reason: label.messageKey,
        );
      }
    });

    test('a param that did not arrive is an empty gap, never "null"', () {
      expect(toolLabelText(en, kind: 'file.read', label: label('sessions.tool.fileRead')), 'Read ');
    });

    test('the row of a call reads its kind and label — the native name is never drawn', () {
      expect(toolCallText(en, shellCall('npm test\nnpm run lint')), 'Shell: npm test');
      expect(
        toolCallText(en, shellCall('npm test'), title: 'Run the tests'),
        'Shell · Run the tests',
      );
    });

    test('S-48 · an mcp call reads "fixture · echo", never the wire name', () {
      expect(
        toolLabelText(
          en,
          kind: 'mcp',
          label: label('sessions.tool.mcp', <String, Object>{'server': 'fixture', 'tool': 'echo'}),
        ),
        'fixture · echo',
      );
    });

    test('S-49 · an mcp label is drawn exactly as the backend split it, never reparsed', () {
      // mcp__a__b__c: whatever the adapter put in server/tool, the app draws it as-is.
      expect(
        toolLabelText(
          en,
          kind: 'mcp',
          label: label('sessions.tool.mcp', <String, Object>{'server': 'a', 'tool': 'b__c'}),
        ),
        'a · b__c',
      );
      // mcp__a: the adapter found no tool name — an empty gap, not an error, not a guess.
      expect(
        toolLabelText(
          en,
          kind: 'mcp',
          label: label('sessions.tool.mcp', <String, Object>{'server': 'a'}),
        ),
        'a · ',
      );
      // mcp____x: leading underscores are the adapter's business — the app only prints the strings.
      expect(
        toolLabelText(
          en,
          kind: 'mcp',
          label: label('sessions.tool.mcp', <String, Object>{'server': '', 'tool': '_x'}),
        ),
        ' · _x',
      );
    });
  });

  group('S-59 · what this build does not know is the generic line', () {
    test('an unknown kind: the name the backend gave, or the kind itself', () {
      expect(
        toolLabelText(
          en,
          kind: 'file.copy',
          label: label('sessions.tool.fileRead', <String, Object>{'path': 'a'}),
        ),
        'file.copy',
      );
      expect(
        toolLabelText(
          en,
          kind: 'vcs.commit',
          label: label('sessions.tool.vcsCommit', <String, Object>{'name': 'Commit'}),
        ),
        'Commit',
      );
    });

    test('an unknown key of a known kind: the generic line too', () {
      expect(toolLabelText(en, kind: 'shell', label: label('sessions.tool.shellLater')), 'shell');
    });

    test('the generic key without a name, or with one that is not text: the kind', () {
      expect(toolLabelText(en, kind: 'other', label: label('sessions.tool.other')), 'other');
      expect(
        toolLabelText(
          en,
          kind: 'other',
          label: label('sessions.tool.other', <String, Object>{'name': 3}),
        ),
        'other',
      );
      expect(
        toolLabelText(
          en,
          kind: 'other',
          label: label('sessions.tool.other', <String, Object>{'name': ''}),
        ),
        'other',
      );
    });

    test('the known kinds are the sixteen of the contract', () {
      expect(knownToolKinds, hasLength(16));
    });
  });

  group('a description the model gave the call', () {
    test('the short name of the kind before it, for every kind that has one', () {
      const Map<String, String> names = <String, String>{
        'file.read': 'Read file',
        'file.edit': 'Edit file',
        'file.write': 'Write file',
        'file.delete': 'Delete',
        'file.move': 'Move',
        'search': 'Search',
        'shell': 'Shell',
        'shell.output': 'Output',
        'web.fetch': 'Fetch',
        'web.search': 'Web search',
        'question': 'Question',
        'plan': 'Plan',
        'tasks': 'Tasks',
      };

      for (final MapEntry<String, String> each in names.entries) {
        expect(
          toolLabelText(en, kind: each.key, label: label('sessions.tool.plan'), title: 'Why'),
          '${each.value} · Why',
          reason: each.key,
        );
      }
    });

    test('mcp, other and an unknown kind keep their label before it', () {
      expect(
        toolLabelText(
          en,
          kind: 'mcp',
          label: label('sessions.tool.mcp', <String, Object>{'server': 'gh', 'tool': 'pr'}),
          title: 'Open it',
        ),
        'gh · pr · Open it',
      );
      expect(
        toolLabelText(
          en,
          kind: 'other',
          label: label('sessions.tool.other', <String, Object>{'name': 'Workflow'}),
          title: 'Run it',
        ),
        'Workflow · Run it',
      );
      expect(
        toolLabelText(en, kind: 'vcs.commit', label: label('sessions.tool.x'), title: 'Save'),
        'vcs.commit · Save',
      );
    });

    test('a subagent keeps its label: the description is already in it', () {
      expect(
        toolLabelText(
          en,
          kind: 'agent',
          label: label('sessions.tool.agent', <String, Object>{'type': 'T', 'description': 'D'}),
          title: 'D',
        ),
        'Subagent (T): D',
      );
    });

    test('the short names, in en and in pt-BR, for the kinds the rows never title', () {
      expect(kindNameText(en, 'mcp'), 'MCP');
      expect(kindNameText(en, 'agent'), 'Subagent');
      expect(kindNameText(en, 'other'), 'Tool');
      expect(kindNameText(pt, 'other'), 'Ferramenta');
      expect(kindNameText(pt, 'web.fetch'), 'Página');
      expect(kindNameText(en, 'vcs.commit'), isNull);
    });

    test(
      'the name of the kind a rule answers: its short name, or the generic one — plan 28 F5',
      () {
        expect(kindNameOrGeneric(en, 'shell'), 'Shell');
        expect(kindNameOrGeneric(pt, 'file.edit'), 'Editar');
        expect(kindNameOrGeneric(en, 'vcs.commit'), 'Tool');
        expect(kindNameOrGeneric(pt, null), 'Ferramenta');
      },
    );
  });
}
