/// What a permission request asks, by the kind of the call — the titles the web says for the same
/// keys, the label when the build has none, and the engine named by its display name (plan 28, B-19).
library;

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/widgets/agent_names.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';
import 'package:remote_claude/features/permission/presentation/widgets/permission_title.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/builders/permissions.dart';
import '../../../support/builders/tools.dart';
import '../../../support/pump_app.dart';

void main() {
  late AppLocalizations en;
  late AppLocalizations pt;

  setUpAll(() async {
    en = await englishCatalogue();
    pt = await AppLocalizations.delegate.load(const Locale('pt'));
  });

  PermissionRequest titled(String key) => aPermissionRequest(titleKey: 'permission.tool.$key');

  test('S-58 · every title key the backend names, as the web says it, in en and in pt-BR', () {
    const Map<String, (String, String)> titles = <String, (String, String)>{
      'fileRead': ('Read a file', 'Ler um arquivo'),
      'fileEdit': ('Edit a file', 'Editar um arquivo'),
      'fileWrite': ('Write a file', 'Escrever um arquivo'),
      'fileDelete': ('Delete a file', 'Apagar um arquivo'),
      'fileMove': ('Move a file', 'Mover um arquivo'),
      'search': ('Search the files', 'Buscar nos arquivos'),
      'shell': ('Run a shell command', 'Executar um comando de shell'),
      'shellOutput': ("Read a command's output", 'Ler a saída de um comando'),
      'webFetch': ('Fetch a page', 'Buscar uma página'),
      'webSearch': ('Search the web', 'Pesquisar na web'),
      'mcp': ('Use an MCP tool', 'Usar uma ferramenta MCP'),
      'agent': ('Start a subagent', 'Iniciar um subagente'),
      'question': ("Answer Engine A's question", 'Responder à pergunta do Engine A'),
      'plan': ('Approve the plan', 'Aprovar o plano'),
      'tasks': ('Change the task list', 'Mudar a lista de tarefas'),
      'other': ('Use a tool', 'Usar uma ferramenta'),
    };

    for (final MapEntry<String, (String, String)> each in titles.entries) {
      expect(permissionTitleText(en, titled(each.key), agent: 'Engine A'), each.value.$1);
      expect(permissionTitleText(pt, titled(each.key), agent: 'Engine A'), each.value.$2);
    }
  });

  test('a title key this build has no words for is the label of the call', () {
    expect(permissionTitleText(en, titled('shellLater')), 'Shell: rm -rf build/');
  });

  test('S-59 · a kind this build does not know is the generic line', () {
    final PermissionRequest request = aPermissionRequest(
      call: aToolCall(kind: 'vcs.commit', messageKey: 'sessions.tool.vcs', params: const {}),
      titleKey: 'permission.tool.vcsCommit',
    );

    expect(permissionTitleText(en, request), 'vcs.commit');
  });

  testWidgets('the engine that asks is named by the display name above the screen', (
    WidgetTester tester,
  ) async {
    late String title;
    late String question;

    await tester.pumpApp(
      AgentNamesScope(
        names: const AgentNames(names: <String, String>{'engine-a': 'Engine A'}),
        child: Builder(
          builder: (BuildContext context) {
            title = permissionTitleOf(context, titled('question'));
            question = questionTitleOf(context, aPermissionRequest());
            return const SizedBox.shrink();
          },
        ),
      ),
    );

    expect(title, "Answer Engine A's question");
    expect(question, "Answer Engine A's question");
  });
}
