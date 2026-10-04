/// The workspace repository over its data source.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/workspace/data/repositories/workspace_repository_impl.dart';
import 'package:remote_claude/features/workspace/domain/entities/workspace.dart';

import '../../../../../support/fakes/fake_workspace_api.dart';

/// A data source that answers what the test set.
class _StubApi extends FakeWorkspaceApi {
  _StubApi(Object? answer) : super(answers: <String, Object?>{'list': answer});

  int get calls => asked.length;
}

void main() {
  test('turns the answer into entities', () async {
    final _StubApi api = _StubApi(<String, Object?>{
      'workspaces': <Object?>[
        <String, Object?>{'path': '/home/someone/project', 'label': 'project'},
      ],
    });

    final List<Workspace> workspaces = await WorkspaceRepositoryImpl(api).list();

    expect(api.calls, 1);
    expect(workspaces.single.path, '/home/someone/project');
  });

  test('an empty allowlist is an empty list, not a failure', () async {
    expect(
      await WorkspaceRepositoryImpl(_StubApi(<String, Object?>{'workspaces': <Object?>[]})).list(),
      isEmpty,
    );
  });
}
