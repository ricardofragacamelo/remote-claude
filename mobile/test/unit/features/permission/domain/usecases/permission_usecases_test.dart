import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_lookup.dart';
import 'package:remote_claude/features/permission/domain/repositories/approval_lock.dart';
import 'package:remote_claude/features/permission/domain/repositories/permission_repository.dart';
import 'package:remote_claude/features/permission/domain/usecases/gate_approval.dart';
import 'package:remote_claude/features/permission/domain/usecases/watch_permissions.dart';

import '../../../../../support/fakes/fake_permission_repository.dart';

void main() {
  group('the gate in front of a yes', () {
    late FakeApprovalLock lock;
    late MemoryApprovalPreferences preferences;
    late GateApproval gate;

    setUp(() {
      lock = FakeApprovalLock();
      preferences = MemoryApprovalPreferences();
      gate = GateApproval(lock, preferences);
    });

    test('opens once the owner confirms', () async {
      expect(await gate('confirm'), ApprovalGate.open);
      expect(lock.asked, <String>['confirm']);
    });

    // S-43 — a refused prompt is not a yes.
    test('stays shut when the owner does not confirm', () async {
      lock.verdict = LockVerdict.refused;

      expect(await gate('confirm'), ApprovalGate.refused);
    });

    // D-07 — a phone with no lock does not approve.
    test('does not open on a phone with no lock', () async {
      lock.available = false;

      expect(await gate('confirm'), ApprovalGate.noLock);
      expect(lock.asked, isEmpty);
    });

    // D-25 — the switch turns off the prompt, not the rule.
    test('does not open on a phone with no lock even with the prompt switched off', () async {
      lock.available = false;
      preferences.required = false;

      expect(await gate('confirm'), ApprovalGate.noLock);
    });

    test('opens without asking when the owner switched the prompt off', () async {
      preferences.required = false;

      expect(await gate('confirm'), ApprovalGate.open);
      expect(lock.asked, isEmpty);
    });
  });

  group('the lock preference', () {
    test('reads, changes and says whether the phone has a lock at all', () async {
      final FakeApprovalLock lock = FakeApprovalLock(available: false);
      final MemoryApprovalPreferences preferences = MemoryApprovalPreferences();
      final ApprovalLockSetting setting = ApprovalLockSetting(lock, preferences);

      expect(await setting.isRequired(), isTrue);
      expect(await setting.hasLock(), isFalse);

      await setting.change(required: false);
      expect(await setting.isRequired(), isFalse);
    });
  });

  group('watching and asking', () {
    test('watching opens a feed for that session', () {
      final FakePermissionRepository repository = FakePermissionRepository();

      final PermissionFeed feed = WatchPermissions(repository)('session-1');

      expect(repository.feed.sessionId, 'session-1');
      expect(feed, same(repository.feed));
    });

    test('asking goes to the server, for that request', () async {
      final FakePermissionRepository repository = FakePermissionRepository()
        ..lookups['request-1'] = () async => const LookupGone();

      expect(await LookupPermission(repository)('session-1', 'request-1'), const LookupGone());
      expect(repository.lookedUp['request-1'], 1);
    });
  });
}
