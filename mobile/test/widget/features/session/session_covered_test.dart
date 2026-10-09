import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:remote_claude/core/navigation/routes.dart';
import 'package:remote_claude/features/session/session.dart';

import '../../../support/session_screen.dart';

/// A screen stacked over the session — the history today, the file viewer next — covers it: the
/// platform hears that no session is on screen, so a question of it is notified instead of waiting
/// behind the screen on top (plan 25, B-08, D-11).
void main() {
  late SessionScreen screen;

  setUp(() => screen = SessionScreen());

  GoRouter routerOf(WidgetTester tester) =>
      GoRouter.of(tester.element(find.byType(SessionPage, skipOffstage: false)));

  /// What the platform heard after [from].
  List<String?> heardSince(int from) => screen.push.shown.sublist(from);

  Future<void> covered(WidgetTester tester) async {
    await screen.pump(tester, routed: true);
    expect(screen.push.shown, <String?>['session-1']);
  }

  testWidgets('S-14 · a screen pushed over the session says none is on screen; back, it is again', (
    WidgetTester tester,
  ) async {
    await covered(tester);

    final int from = screen.push.shown.length;
    unawaited(routerOf(tester).push<void>(historyRouteFor('/w')));
    await tester.pumpAndSettle();
    expect(heardSince(from), <String?>[null]);

    routerOf(tester).pop();
    await tester.pumpAndSettle();
    expect(heardSince(from), <String?>[null, 'session-1']);
  });

  testWidgets('S-15 · back from the background with the screen still on top: still none', (
    WidgetTester tester,
  ) async {
    await covered(tester);
    unawaited(routerOf(tester).push<void>(historyRouteFor('/w')));
    await tester.pumpAndSettle();
    final int from = screen.push.shown.length;

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();

    expect(heardSince(from).whereType<String>(), isEmpty);
  });

  testWidgets(
    'S-16 · two screens on top and two backs: this session at the end, nothing in between',
    (WidgetTester tester) async {
      await covered(tester);
      final int from = screen.push.shown.length;

      unawaited(routerOf(tester).push<void>(historyRouteFor('/w')));
      await tester.pumpAndSettle();
      unawaited(routerOf(tester).push<void>(rulesRoute));
      await tester.pumpAndSettle();
      routerOf(tester).pop();
      await tester.pumpAndSettle();
      expect(heardSince(from), <String?>[null]);

      routerOf(tester).pop();
      await tester.pumpAndSettle();
      expect(heardSince(from), <String?>[null, 'session-1']);
    },
  );

  testWidgets('S-17 · the session goes while covered: nothing is said after it is gone', (
    WidgetTester tester,
  ) async {
    await covered(tester);
    unawaited(routerOf(tester).push<void>(historyRouteFor('/w')));
    await tester.pumpAndSettle();
    final int from = screen.push.shown.length;

    routerOf(tester).go(rulesRoute);
    await tester.pumpAndSettle();
    expect(find.byType(SessionPage, skipOffstage: false), findsNothing);

    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pump();

    expect(heardSince(from), isEmpty);
  });
}
