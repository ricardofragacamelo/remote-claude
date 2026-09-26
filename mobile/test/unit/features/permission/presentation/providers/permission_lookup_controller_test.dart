import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_lookup.dart';
import 'package:remote_claude/features/permission/presentation/providers/permission_lookup_controller.dart';

import '../../../../../support/fakes/fake_permission_repository.dart';

void main() {
  late FakePermissionRepository repository;
  late FakeApprovalLock lock;
  late MemoryApprovalPreferences preferences;

  ProviderContainer build() {
    repository = FakePermissionRepository();
    lock = FakeApprovalLock();
    preferences = MemoryApprovalPreferences();

    final ProviderContainer container = ProviderContainer(
      overrides: permissionOverrides(repository: repository, lock: lock, preferences: preferences),
    );
    addTearDown(container.dispose);
    return container;
  }

  // S-45 — the screen of a notification asks the server, for that request.
  test('asks the server where the request stands', () async {
    final ProviderContainer container = build();
    repository.lookups['request-1'] = () async => const LookupExpired();

    expect(
      await container.read(permissionLookupProvider('session-1', 'request-1').future),
      const LookupExpired(),
    );
    expect(repository.lookedUp['request-1'], 1);
  });

  group('the lock preference', () {
    test('starts on, and says whether the phone has a lock', () async {
      final ProviderContainer container = build();
      lock.available = false;

      expect(
        await container.read(approvalLockControllerProvider.future),
        const ApprovalLockState(isRequired: true, hasLock: false),
      );
    });

    test('turned off, stays off', () async {
      final ProviderContainer container = build();
      await container.read(approvalLockControllerProvider.future);

      await container.read(approvalLockControllerProvider.notifier).change(required: false);

      expect(preferences.required, isFalse);
      expect(container.read(approvalLockControllerProvider).value?.isRequired, isFalse);
    });
  });
}
