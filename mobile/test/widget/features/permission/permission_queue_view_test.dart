/// The questions of a session on screen, wired to the controller, the device, the connection and
/// the lock — what a person actually taps.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/features/device/device.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_event.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_outcome.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';
import 'package:remote_claude/features/permission/domain/repositories/approval_lock.dart';
import 'package:remote_claude/features/permission/permission.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/builders/permissions.dart';
import '../../../support/fakes/fake_permission_repository.dart';
import '../../../support/fakes/stub_device_controller.dart';
import '../../../support/pump_app.dart';

void main() {
  late AppLocalizations l10n;
  late FakePermissionRepository repository;
  late FakeApprovalLock lock;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  Future<void> pumpQueue(
    WidgetTester tester, {
    DeviceStatus device = DeviceStatus.approved,
    ConnectionStatus connection = ConnectionStatus.ready,
    bool hasLock = true,
  }) async {
    repository = FakePermissionRepository();
    lock = FakeApprovalLock(available: hasLock);

    await tester.pumpApp(
      const SingleChildScrollView(child: PermissionQueueView(sessionId: 'session-1')),
      overrides: <Override>[
        ...permissionOverrides(repository: repository, lock: lock, clock: () => t0),
        deviceControllerAnswering(
          AsyncValue<RegisteredDevice?>.data(aRegisteredDevice(status: device)),
        ),
        connectionStatusProvider.overrideWith(
          (Ref ref) => Stream<ConnectionStatus>.value(connection),
        ),
      ],
    );
    await tester.pumpAndSettle();
  }

  Future<void> ask(WidgetTester tester, PermissionRequest request) async {
    repository.feed.emit(asked(request));
    await tester.pumpAndSettle();
  }

  bool enabled(WidgetTester tester, String label) =>
      tester
          .widget<ButtonStyleButton>(
            find
                .ancestor(of: find.text(label), matching: find.bySubtype<ButtonStyleButton>())
                .first,
          )
          .onPressed !=
      null;

  testWidgets('nothing asked and nothing decided is nothing on screen', (
    WidgetTester tester,
  ) async {
    await pumpQueue(tester);

    expect(find.text(l10n.permissionQueueTitle), findsNothing);
  });

  testWidgets('a question arriving is a card under "waiting for you"', (WidgetTester tester) async {
    await pumpQueue(tester);

    await ask(tester, aPermissionRequest());

    expect(find.text(l10n.permissionQueueTitle), findsOneWidget);
    expect(find.text('rm -rf build/'), findsOneWidget);
  });

  testWidgets('refusing sends the refusal', (WidgetTester tester) async {
    await pumpQueue(tester);
    await ask(tester, aPermissionRequest());

    await tester.tap(find.text(l10n.permissionDeny));
    await tester.pumpAndSettle();

    expect(repository.feed.answers.single.decision, PermissionDecision.deny);
    expect(find.text(l10n.permissionSending), findsOneWidget);
  });

  // S-41, through the whole wiring: one tap arms, the second step sends.
  testWidgets('a destructive yes takes the second step, then the lock, then leaves', (
    WidgetTester tester,
  ) async {
    await pumpQueue(tester);
    await ask(tester, aPermissionRequest());

    await tester.tap(find.text(l10n.permissionScopeOnce));
    await tester.pumpAndSettle();
    expect(repository.feed.answers, isEmpty);
    expect(find.text(l10n.permissionConfirmTitle), findsOneWidget);

    await tester.tap(find.text(l10n.permissionConfirmAction));
    await tester.pumpAndSettle();

    expect(lock.asked, <String>[l10n.permissionLockReason]);
    expect(repository.feed.answers.single.decision, PermissionDecision.allow);
  });

  // S-43 — the fingerprint was refused: nothing leaves, and the card says so.
  testWidgets('a refused fingerprint does not approve', (WidgetTester tester) async {
    await pumpQueue(tester);
    lock.verdict = LockVerdict.refused;
    await ask(tester, aPermissionRequest(riskHint: RiskHint.write));

    await tester.tap(find.text(l10n.permissionScopeOnce));
    await tester.pumpAndSettle();

    expect(repository.feed.answers, isEmpty);
    expect(find.text(l10n.permissionLockRefused), findsOneWidget);
    expect(enabled(tester, l10n.permissionScopeOnce), isTrue);
  });

  // S-44 — with no biometrics the prompt still stands between the tap and the yes: the device PIN
  // answers it, and nothing leaves without that answer.
  testWidgets('with only a PIN, the yes still waits for the prompt', (WidgetTester tester) async {
    await pumpQueue(tester);
    await ask(tester, aPermissionRequest(riskHint: RiskHint.write));

    await tester.tap(find.text(l10n.permissionScopeOnce));
    await tester.pumpAndSettle();

    expect(lock.asked, hasLength(1));
    expect(repository.feed.answers, hasLength(1));
  });

  // S-83 — no lock at all: the card says why, and refusing is still there.
  testWidgets('a phone with no lock refuses to approve, and says why', (WidgetTester tester) async {
    await pumpQueue(tester, hasLock: false);
    await ask(tester, aPermissionRequest(riskHint: RiskHint.write));

    expect(enabled(tester, l10n.permissionScopeOnce), isFalse);
    expect(enabled(tester, l10n.permissionDeny), isTrue);
    expect(find.text(l10n.permissionNoLockTitle), findsOneWidget);
  });

  // S-48 — two taps are one answer.
  testWidgets('a double tap sends one answer', (WidgetTester tester) async {
    await pumpQueue(tester);
    await ask(tester, aPermissionRequest());

    await tester.tap(find.text(l10n.permissionDeny));
    await tester.tap(find.text(l10n.permissionDeny), warnIfMissed: false);
    await tester.pumpAndSettle();

    expect(repository.feed.answers, hasLength(1));
  });

  // S-87 — the answer did not leave, the card says so, and it can be tried again.
  testWidgets('an answer that did not leave says so and can be tried again', (
    WidgetTester tester,
  ) async {
    await pumpQueue(tester);
    await ask(tester, aPermissionRequest());
    repository.feed.connected = false;

    await tester.tap(find.text(l10n.permissionDeny));
    await tester.pumpAndSettle();

    expect(find.text(l10n.permissionNotSent), findsOneWidget);
    expect(enabled(tester, l10n.permissionDeny), isTrue);
  });

  // S-49 — answered in the browser: the card goes on its own, saying where.
  testWidgets('a request answered in the browser leaves, saying so', (WidgetTester tester) async {
    await pumpQueue(tester);
    await ask(tester, aPermissionRequest());

    repository.feed.emit(settled('request-1', origin: AnswerOrigin.web));
    await tester.pumpAndSettle();

    expect(find.text('rm -rf build/'), findsNothing);
    expect(find.text(l10n.permissionOutcomeAllowedWeb), findsOneWidget);
  });

  // S-65 — more time moves the countdown; at the ceiling the action goes, with the reason.
  testWidgets('extending moves the countdown, and the ceiling takes the action away', (
    WidgetTester tester,
  ) async {
    await pumpQueue(tester);
    await ask(tester, aPermissionRequest());

    await tester.tap(find.text(l10n.permissionExtend));
    repository.feed.emit(
      PermissionDeadlineMoved(
        requestId: 'request-1',
        expiresAt: t0.add(const Duration(minutes: 4)),
        remainingExtensions: 0,
      ),
    );
    await tester.pumpAndSettle();

    expect(repository.feed.extensions, <String>['request-1']);
    expect(find.text(l10n.permissionRemaining(240)), findsOneWidget);
    expect(find.text(l10n.permissionExtend), findsNothing);
    expect(find.text(l10n.permissionExtendExhausted), findsOneWidget);
  });

  testWidgets('an extension that could not leave says so', (WidgetTester tester) async {
    await pumpQueue(tester);
    await ask(tester, aPermissionRequest());
    repository.feed.connected = false;

    await tester.tap(find.text(l10n.permissionExtend));
    await tester.pumpAndSettle();

    expect(find.text(l10n.permissionNotSent), findsOneWidget);
  });

  // S-66 — the refusal of an extension for something already over brings nothing back.
  testWidgets('extending something already answered does not bring the card back', (
    WidgetTester tester,
  ) async {
    await pumpQueue(tester);
    await ask(tester, aPermissionRequest());
    await tester.tap(find.text(l10n.permissionExtend));

    repository.feed
      ..emit(settled('request-1', origin: AnswerOrigin.web))
      ..emit(
        const PermissionExtensionRefused(requestId: 'request-1', refusal: ExtensionRefusal.over),
      );
    await tester.pumpAndSettle();

    expect(find.text('rm -rf build/'), findsNothing);
    expect(find.text(l10n.permissionOutcomeAllowedWeb), findsOneWidget);
  });

  // S-84 — a pending phone sees the question and cannot answer it, and is told why.
  testWidgets('a phone that is still pending sees the card, with the controls off', (
    WidgetTester tester,
  ) async {
    await pumpQueue(tester, device: DeviceStatus.pending);
    await ask(tester, aPermissionRequest());

    expect(find.text('rm -rf build/'), findsOneWidget);
    expect(enabled(tester, l10n.permissionDeny), isFalse);
    expect(find.text(l10n.permissionDeviceBlocked), findsOneWidget);
  });

  // S-86 — offline: nothing that needs the network can be tapped, and the card says why.
  testWidgets('offline, the answers are off and the card says why', (WidgetTester tester) async {
    await pumpQueue(tester, connection: ConnectionStatus.reconnecting);
    await ask(tester, aPermissionRequest());

    expect(enabled(tester, l10n.permissionDeny), isFalse);
    expect(enabled(tester, l10n.permissionExtend), isFalse);
    expect(find.text(l10n.permissionOffline), findsOneWidget);
  });
}
