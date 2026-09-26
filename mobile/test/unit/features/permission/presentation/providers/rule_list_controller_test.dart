/// The rules as the screen has them, and the three decisions about taking one back.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_rule.dart';
import 'package:remote_claude/features/permission/domain/repositories/permission_rule_repository.dart';
import 'package:remote_claude/features/permission/permission_providers.dart';
import 'package:remote_claude/features/permission/presentation/providers/rule_list_controller.dart';

import '../../../../../support/fakes/fake_permission_rule_repository.dart';

const ServerFailure unexpected = ServerFailure(
  code: 'INTERNAL_ERROR',
  messageKey: 'common.error.unexpected',
  traceId: 'trace-1',
);

void main() {
  late FakePermissionRuleRepository repository;

  ProviderContainer build({List<PermissionRule>? rules}) {
    repository = FakePermissionRuleRepository(
      rules: rules ?? <PermissionRule>[aPermissionRule(), aPermissionRule(id: 'rule_2')],
    );

    final ProviderContainer container = ProviderContainer(
      overrides: <Override>[
        permissionRuleRepositoryProvider.overrideWithValue(repository as PermissionRuleRepository),
      ],
    );
    addTearDown(container.dispose);

    // Held for the whole test: an `@riverpod` notifier is disposed as soon as nothing listens.
    final ProviderSubscription<AsyncValue<RuleBoard>> subscription = container.listen(
      ruleListControllerProvider,
      (AsyncValue<RuleBoard>? previous, AsyncValue<RuleBoard> next) {},
    );
    addTearDown(subscription.close);

    return container;
  }

  Future<RuleBoard> loaded(ProviderContainer container) =>
      container.read(ruleListControllerProvider.future);

  RuleBoard board(ProviderContainer container) =>
      container.read(ruleListControllerProvider).requireValue;

  RuleListController controller(ProviderContainer container) =>
      container.read(ruleListControllerProvider.notifier);

  test('loads the rules', () async {
    final ProviderContainer container = build();

    expect((await loaded(container)).rules.map((PermissionRule r) => r.id), <String>[
      'rule_1',
      'rule_2',
    ]);
  });

  test('a revoked rule leaves the list, and the others stay where they were — S-16', () async {
    final ProviderContainer container = build();
    await loaded(container);

    await controller(container).revoke('rule_1');

    expect(board(container).rules.map((PermissionRule r) => r.id), <String>['rule_2']);
    expect(board(container).revoking, isEmpty);
  });

  // S-69 — two taps are two requests; the second one is nothing.
  test('a second tap while the first is in flight revokes nothing', () async {
    final ProviderContainer container = build();
    await loaded(container);
    repository.holdRevocations = true;

    final Future<void> first = controller(container).revoke('rule_1');
    await controller(container).revoke('rule_1');

    expect(repository.revoked, <String>['rule_1']);
    expect(board(container).revoking, <String>{'rule_1'});

    repository.releaseRevocations();
    await first;
    expect(board(container).revoking, isEmpty);
  });

  test('a different rule may be revoked while one is in flight', () async {
    final ProviderContainer container = build();
    await loaded(container);
    repository.holdRevocations = true;

    final Future<void> first = controller(container).revoke('rule_1');
    final Future<void> second = controller(container).revoke('rule_2');

    expect(repository.revoked, <String>['rule_1', 'rule_2']);
    repository.releaseRevocations();
    await Future.wait(<Future<void>>[first, second]);
    expect(board(container).rules, isEmpty);
  });

  // S-21 — the rule is still answering, and that is what the row must keep saying.
  test('a failed revocation keeps the row, with the failure beside it', () async {
    final ProviderContainer container = build();
    await loaded(container);
    repository.revokeFailure = unexpected;

    await controller(container).revoke('rule_1');

    expect(board(container).rules, hasLength(2));
    expect(board(container).failedRuleId, 'rule_1');
    expect(board(container).failure, unexpected);
    expect(board(container).revoking, isEmpty);
  });

  test('trying again clears the last failure', () async {
    final ProviderContainer container = build();
    await loaded(container);
    repository.revokeFailure = unexpected;
    await controller(container).revoke('rule_1');

    repository.revokeFailure = null;
    await controller(container).revoke('rule_1');

    expect(board(container).failure, isNull);
    expect(board(container).failedRuleId, isNull);
    expect(board(container).rules.map((PermissionRule r) => r.id), <String>['rule_2']);
  });

  // S-20 — rules are read, not pushed; reading again is how another device's rule appears.
  test('reading again shows a rule granted on another device', () async {
    final ProviderContainer container = build(rules: <PermissionRule>[aPermissionRule()]);
    await loaded(container);
    repository.rules = <PermissionRule>[aPermissionRule(), aPermissionRule(id: 'from-web')];

    await controller(container).reload();

    expect(board(container).rules.map((PermissionRule r) => r.id), <String>['rule_1', 'from-web']);
  });

  test('a list that cannot be read is an error the screen can retry', () async {
    final ProviderContainer container = build();
    await loaded(container);
    repository.listFailure = unexpected;

    await controller(container).reload();

    expect(container.read(ruleListControllerProvider).error, unexpected);
  });

  test('does nothing before the list has loaded', () async {
    final ProviderContainer container = build();

    await controller(container).revoke('rule_1');

    expect(repository.revoked, isEmpty);
  });

  test('writes nothing back when the list is being read again as the answer comes', () async {
    final ProviderContainer container = build();
    await loaded(container);
    repository.holdRevocations = true;

    final Future<void> revoking = controller(container).revoke('rule_1');
    final Future<void> reloading = controller(container).reload();
    repository.releaseRevocations();
    await revoking;

    // The reload is what decides the list now; the revocation's answer belongs to a list that is
    // gone, and writing it back would put a stale board on screen.
    await reloading;
    expect(board(container).rules.map((PermissionRule r) => r.id), <String>['rule_2']);
    expect(board(container).revoking, isEmpty);
  });
}
