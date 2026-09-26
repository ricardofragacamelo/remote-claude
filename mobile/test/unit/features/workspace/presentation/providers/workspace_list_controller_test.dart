/// The allowlist as the screen has it, including the state it can act on.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/workspace/domain/entities/workspace.dart';
import 'package:remote_claude/features/workspace/domain/repositories/workspace_repository.dart';
import 'package:remote_claude/features/workspace/presentation/providers/workspace_list_controller.dart';
import 'package:remote_claude/features/workspace/workspace_providers.dart';

import '../../../../../support/fakes/fake_workspace_repository.dart';

const Workspace project = Workspace(path: '/home/someone/project', label: 'project');

void main() {
  late FakeWorkspaceRepository repository;

  ProviderContainer build({List<Workspace>? workspaces, Object? failure}) {
    repository = FakeWorkspaceRepository(
      workspaces: workspaces ?? <Workspace>[project],
      failure: failure,
    );

    final ProviderContainer container = ProviderContainer(
      overrides: <Override>[
        workspaceRepositoryProvider.overrideWithValue(repository as WorkspaceRepository),
      ],
    );

    addTearDown(container.dispose);

    // Held for the length of the test: an `@riverpod` notifier is disposed as soon as nothing
    // listens, so a test that only read it would build a fresh one for every assertion — and
    // would prove nothing about a retry replacing what failed.
    final ProviderSubscription<AsyncValue<List<Workspace>>> subscription = container.listen(
      workspaceListControllerProvider,
      (AsyncValue<List<Workspace>>? previous, AsyncValue<List<Workspace>> next) {},
    );
    addTearDown(subscription.close);

    return container;
  }

  /// Waits for the controller to land, whichever way it lands.
  ///
  /// It waits for a **value or an error**, and not for `isLoading` to go false: in Riverpod a
  /// build that failed while the provider is still settling is an `AsyncLoading` that carries the
  /// error, so a loop on `isLoading` waits for ever for the one case this file is about. The
  /// banner learned the same thing the hard way.
  ///
  /// Deliberately not `read(provider.future)` either: that future carries the failure as an
  /// exception, and a test about the state **holding** the failure should not have to catch one
  /// to look at it.
  Future<void> settled(ProviderContainer container) async {
    while (true) {
      final AsyncValue<List<Workspace>> state = container.read(workspaceListControllerProvider);

      if (state.hasValue || state.hasError) {
        return;
      }

      await Future<void>.delayed(Duration.zero);
    }
  }

  test('reads the allowlist once', () async {
    final ProviderContainer container = build();

    await settled(container);

    expect(container.read(workspaceListControllerProvider).value, <Workspace>[project]);
    expect(repository.reads, 1);
  });

  test('a failure lands in the state rather than being thrown at the screen', () async {
    final ProviderContainer container = build(failure: const NetworkFailure(traceId: 'trace-1'));

    await settled(container);

    // The screen renders it; nothing is thrown at a widget.
    expect(container.read(workspaceListControllerProvider).error, isA<NetworkFailure>());
  });

  test('the retry asks again, and what it finds replaces what failed', () async {
    final ProviderContainer container = build(failure: const NetworkFailure(traceId: 'trace-1'));
    await settled(container);
    final int readsBeforeRetry = repository.reads;

    repository.failure = null;
    await container.read(workspaceListControllerProvider.notifier).reload();

    expect(container.read(workspaceListControllerProvider).value, <Workspace>[project]);
    expect(repository.reads, readsBeforeRetry + 1);
  });

  test('a retry that fails again stays in the error state', () async {
    final ProviderContainer container = build();
    await settled(container);

    repository.failure = const NetworkFailure(traceId: 'trace-2');
    await container.read(workspaceListControllerProvider.notifier).reload();

    expect(container.read(workspaceListControllerProvider).hasError, isTrue);
  });
}
