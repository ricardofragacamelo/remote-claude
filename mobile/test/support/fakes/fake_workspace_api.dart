/// The workspace endpoints, answering what the test set and remembering what was asked.
library;

import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/workspace/data/datasources/workspace_api_data_source.dart';

/// Every call answers [answers] for its method — `null` when the test set nothing — or throws
/// [failure] when one is set.
class FakeWorkspaceApi implements WorkspaceApiDataSource {
  FakeWorkspaceApi({Map<String, Object?>? answers}) : answers = answers ?? <String, Object?>{};

  final Map<String, Object?> answers;

  /// What was asked, as `method` or `method:argument`.
  final List<String> asked = <String>[];

  Failure? failure;

  Future<Object?> _answer(String method, [Object? argument]) async {
    asked.add(argument == null ? method : '$method:$argument');

    final Failure? refusal = failure;
    if (refusal != null) {
      throw refusal;
    }

    return answers[method];
  }

  @override
  Future<Object?> list() => _answer('list');

  @override
  Future<Object?> openFolders() => _answer('openFolders');

  @override
  Future<Object?> openFolder(String path) => _answer('openFolder', path);

  @override
  Future<Object?> closeFolder(String path) => _answer('closeFolder', path);

  @override
  Future<Object?> recent() => _answer('recent');

  @override
  Future<Object?> pinRecent(String path, {required bool pinned}) =>
      _answer('pinRecent', '$path=$pinned');

  @override
  Future<Object?> forgetRecent(String path) => _answer('forgetRecent', path);

  @override
  Future<Object?> directories(String path) => _answer('directories', path);
}
