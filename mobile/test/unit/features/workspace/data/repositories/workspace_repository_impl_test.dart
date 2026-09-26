/// The workspace repository over its data source.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/workspace/data/datasources/workspace_api_data_source.dart';
import 'package:remote_claude/features/workspace/data/repositories/workspace_repository_impl.dart';
import 'package:remote_claude/features/workspace/domain/entities/workspace.dart';

/// A data source that answers what the test set.
class _StubApi implements WorkspaceApiDataSource {
  _StubApi(this._answer);

  final Object? _answer;
  int calls = 0;

  @override
  Future<Object?> list() async {
    calls += 1;
    return _answer;
  }
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
