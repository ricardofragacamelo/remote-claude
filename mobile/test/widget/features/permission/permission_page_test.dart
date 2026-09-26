/// The screen a notification opens: nothing from the notification, everything from the server.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/core/network/ws_client_provider.dart';
import 'package:remote_claude/features/device/device.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_lookup.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_outcome.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';
import 'package:remote_claude/features/permission/permission.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/builders/permissions.dart';
import '../../../support/fakes/fake_permission_repository.dart';
import '../../../support/fakes/stub_device_controller.dart';
import '../../../support/pump_app.dart';

/// What the session route shows in these tests: a marker, because what is proven is that the app
/// went there.
const String sessionMarker = 'the session screen';
const String rulesMarker = 'the rules screen';

void main() {
  late AppLocalizations l10n;
  late FakePermissionRepository repository;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  setUp(() => repository = FakePermissionRepository());

  Future<void> open(WidgetTester tester, {bool settle = true}) async {
    await tester.pumpRouted(
      <RouteBase>[
        GoRoute(
          path: rulesRoute,
          builder: (BuildContext context, GoRouterState state) => const Text(rulesMarker),
        ),
        GoRoute(
          path: '/sessions/:sessionId',
          builder: (BuildContext context, GoRouterState state) => const Text(sessionMarker),
          routes: <RouteBase>[
            GoRoute(
              path: 'permissions/:requestId',
              builder: (BuildContext context, GoRouterState state) => PermissionPage(
                sessionId: state.pathParameters['sessionId']!,
                requestId: state.pathParameters['requestId']!,
              ),
            ),
          ],
        ),
      ],
      initialLocation: permissionRouteFor('session-1', 'request-1'),
      overrides: <Override>[
        ...permissionOverrides(repository: repository, clock: () => t0),
        deviceControllerAnswering(AsyncValue<RegisteredDevice?>.data(aRegisteredDevice())),
        connectionStatusProvider.overrideWith(
          (Ref ref) => Stream<ConnectionStatus>.value(ConnectionStatus.ready),
        ),
      ],
    );

    if (settle) {
      await tester.pumpAndSettle();
    } else {
      await tester.pump();
    }
  }

  void serverSays(PermissionLookup lookup) => repository.lookups['request-1'] = () async => lookup;

  // S-45 — nothing is rendered before the server answers, not even what the socket already said.
  testWidgets('shows that it is checking until the server answers, and nothing else', (
    WidgetTester tester,
  ) async {
    await open(tester, settle: false);

    repository.feed.emit(asked(aPermissionRequest()));
    await tester.pump();

    expect(find.text(l10n.permissionCheckingTitle), findsOneWidget);
    expect(find.text('rm -rf build/'), findsNothing);
    expect(repository.lookedUp['request-1'], 1);
  });

  testWidgets('a pending request is its card, answerable once the socket re-delivers it', (
    WidgetTester tester,
  ) async {
    serverSays(LookupPending(aPermissionRequest(), remainingExtensions: 1));
    await open(tester);

    expect(find.text('rm -rf build/'), findsOneWidget);
    expect(find.text(l10n.permissionConnecting), findsOneWidget);

    repository.feed.emit(asked(aPermissionRequest()));
    await tester.pumpAndSettle();

    expect(find.text(l10n.permissionConnecting), findsNothing);
    await tester.tap(find.text(l10n.permissionDeny));
    await tester.pumpAndSettle();
    expect(repository.feed.answers.single.frameId, 'frame-1');
  });

  // S-46 — already answered: how, and where — never a card to answer.
  // Plan 03, B-10 and D-04 — "don't ask again" is two steps, and the second leads to the rules.
  testWidgets('a persisted yes is armed first, and its second step leads to the rules', (
    WidgetTester tester,
  ) async {
    final PermissionRequest offering = aPermissionRequest(
      riskHint: RiskHint.read,
      scopes: const <PermissionScope>[PermissionScope.once, PermissionScope.always],
      rule: const RuleOffer(pattern: 'Bash(git status)', lifetime: Duration(days: 90)),
    );
    serverSays(LookupPending(offering, remainingExtensions: 1));
    await open(tester);
    repository.feed.emit(asked(offering));
    await tester.pumpAndSettle();

    await tester.tap(find.text(l10n.permissionScopeAlways));
    await tester.pumpAndSettle();

    // Armed, not sent: nothing has left for the server yet.
    expect(repository.feed.answers, isEmpty);
    expect(find.text(l10n.permissionPersistTitle), findsOneWidget);

    await tester.tap(find.text(l10n.permissionPersistOpenRules));
    await tester.pumpAndSettle();

    expect(find.text(rulesMarker), findsOneWidget);
  });

  testWidgets('a request already answered shows who answered it, and no controls', (
    WidgetTester tester,
  ) async {
    serverSays(
      const LookupSettled(
        PermissionOutcome(
          requestId: 'request-1',
          decision: PermissionDecision.deny,
          auto: false,
          origin: AnswerOrigin.web,
        ),
      ),
    );
    await open(tester);

    expect(find.text(l10n.permissionOutcomeRefusedWeb), findsOneWidget);
    expect(find.text(l10n.permissionDeny), findsNothing);
  });

  testWidgets('a request the server forgot says there is nothing to answer', (
    WidgetTester tester,
  ) async {
    serverSays(const LookupGone());
    await open(tester);

    expect(find.text(l10n.permissionGoneTitle), findsOneWidget);
    expect(find.text(l10n.permissionGoneBody), findsOneWidget);
  });

  // S-57 — a push opened after the deadline is not an actionable card.
  testWidgets('a request that ran out of time is not a card', (WidgetTester tester) async {
    serverSays(const LookupExpired());
    await open(tester);

    expect(find.text(l10n.permissionOutcomeExpired), findsOneWidget);
    expect(find.text(l10n.permissionDeny), findsNothing);
  });

  // S-49 — answered in the browser while this screen was open.
  testWidgets('answered elsewhere while open, the card turns into how it ended', (
    WidgetTester tester,
  ) async {
    serverSays(LookupPending(aPermissionRequest()));
    await open(tester);

    repository.feed.emit(settled('request-1', origin: AnswerOrigin.web));
    await tester.pumpAndSettle();

    expect(find.text(l10n.permissionOutcomeAllowedWeb), findsOneWidget);
    expect(find.text('rm -rf build/'), findsNothing);
  });

  // S-47 — opening the link again sends nothing: asking is all an opening does.
  testWidgets('opening the same link again resends nothing', (WidgetTester tester) async {
    serverSays(LookupPending(aPermissionRequest()));
    await open(tester);
    repository.feed.emit(asked(aPermissionRequest()));
    await tester.pumpAndSettle();
    await tester.tap(find.text(l10n.permissionDeny));
    await tester.pumpAndSettle();

    // The server now knows it as answered — from this phone.
    serverSays(
      const LookupSettled(
        PermissionOutcome(
          requestId: 'request-1',
          decision: PermissionDecision.deny,
          auto: false,
          origin: AnswerOrigin.mobile,
        ),
      ),
    );
    final GoRouter router = GoRouter.of(tester.element(find.byType(PermissionPage)));
    router.go(sessionRouteFor('session-1'));
    await tester.pumpAndSettle();
    router.go(permissionRouteFor('session-1', 'request-1'));
    await tester.pumpAndSettle();

    expect(repository.lookedUp['request-1'], 2);
    expect(find.text(l10n.permissionOutcomeRefusedPhone), findsOneWidget);
    expect(repository.feeds.expand((FakePermissionFeed feed) => feed.answers), hasLength(1));
  });

  // S-79 — somebody else's request is refused, and the reason is translated.
  testWidgets('a request of somebody else is an error, translated, and can be asked again', (
    WidgetTester tester,
  ) async {
    repository.lookups['request-1'] = () async => throw const ServerFailure(
      code: 'PERMISSION_NOT_OWNED',
      messageKey: 'permission.error.notOwned',
      traceId: 'trace-1',
    );
    await open(tester);

    expect(find.text(l10n.permissionErrorNotOwned), findsOneWidget);
    expect(find.text('rm -rf build/'), findsNothing);

    await tester.tap(find.text(l10n.commonActionRetry));
    await tester.pumpAndSettle();
    expect(repository.lookedUp['request-1'], 2);
  });

  testWidgets('from a request that is over, the session is one tap away', (
    WidgetTester tester,
  ) async {
    serverSays(const LookupGone());
    await open(tester);

    await tester.tap(find.text(l10n.permissionOpenSession));
    await tester.pumpAndSettle();

    expect(find.text(sessionMarker), findsOneWidget);
  });
}
