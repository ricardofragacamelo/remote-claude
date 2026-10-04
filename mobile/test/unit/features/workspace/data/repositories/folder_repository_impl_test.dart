/// The folder repository over its data source — plan 10, B-38.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/workspace/data/repositories/folder_repository_impl.dart';
import 'package:remote_claude/features/workspace/domain/entities/folder.dart';
import 'package:remote_claude/features/workspace/domain/usecases/manage_folders.dart';

import '../../../../../support/fakes/fake_workspace_api.dart';

const Failure limit = ServerFailure(
  code: 'OPEN_FOLDERS_LIMIT_REACHED',
  messageKey: 'workspace.error.openFoldersLimitReached',
  traceId: 't-1',
  params: <String, String>{'limit': '8'},
);

void main() {
  late FakeWorkspaceApi api;
  late ManageFolders folders;

  setUp(() {
    api = FakeWorkspaceApi();
    folders = ManageFolders(FolderRepositoryImpl(api));
  });

  test('reads the open and the recent folders from their endpoints', () async {
    api.answers['openFolders'] = <String, Object?>{
      'folders': <Object?>[
        <String, Object?>{'path': '/w/a', 'state': 'available'},
      ],
    };
    api.answers['recent'] = <String, Object?>{'folders': <Object?>[]};

    expect((await folders.openFolders()).single.path, '/w/a');
    expect(await folders.recent(), isEmpty);
    expect(api.asked, <String>['openFolders', 'recent']);
  });

  // S-143 · opening answers the tab, created or already there.
  test('S-143 · opening answers the tab the server answered', () async {
    api.answers['openFolder'] = <String, Object?>{'path': '/w/a', 'state': 'available'};

    expect(
      await folders.open('/w/a'),
      const OpenFolderEntry(path: '/w/a', state: FolderState.available),
    );
    expect(api.asked, <String>['openFolder:/w/a']);
  });

  test('S-143 · past the ceiling the refusal reaches the caller with the ceiling', () async {
    api.failure = limit;

    await expectLater(
      folders.open('/w/a'),
      throwsA(isA<ServerFailure>().having((Failure f) => f.params['limit'], 'limit', '8')),
    );
  });

  test('S-142 · an answer to opening that is not a tab is a failure, not a crash', () async {
    api.answers['openFolder'] = <String, Object?>{'nope': true};

    await expectLater(folders.open('/w/a'), throwsA(isA<UnexpectedFailure>()));
  });

  // S-144 · closing and forgetting twice is the same as once.
  test('S-144 · closing, pinning and forgetting go to their endpoints, again and again', () async {
    await folders.close('/w/a');
    await folders.close('/w/a');
    await folders.pin('/w/b', pinned: true);
    await folders.forget('/w/b');
    await folders.forget('/w/b');

    expect(api.asked, <String>[
      'closeFolder:/w/a',
      'closeFolder:/w/a',
      'pinRecent:/w/b=true',
      'forgetRecent:/w/b',
      'forgetRecent:/w/b',
    ]);
  });

  test('S-145 · one level of a folder, or a failure when the answer is not one', () async {
    api.answers['directories'] = <String, Object?>{
      'path': '/w',
      'root': <String, Object?>{'label': 'work'},
      'entries': <Object?>[],
    };
    expect((await folders.directories('/w')).rootLabel, 'work');

    api.answers['directories'] = null;
    await expectLater(folders.directories('/w'), throwsA(isA<UnexpectedFailure>()));
  });
}
