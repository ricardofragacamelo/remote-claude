/// The usage screen: loading, empty, error-with-retry, and the windows themselves — plan 16, D-09.
library;

import 'dart:async';

import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/engines/claude/usage/domain/entities/rate_limit_window.dart';
import 'package:remote_claude/engines/claude/usage/domain/repositories/usage_repository.dart';
import 'package:remote_claude/engines/claude/usage/presentation/pages/claude_usage_view.dart';
import 'package:remote_claude/engines/claude/usage/presentation/providers/usage_providers.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../../support/fakes/fake_usage_repository.dart';
import '../../../../support/pump_app.dart';

RateLimitWindow _window({
  String kind = 'five_hour',
  RateLimitStatus status = RateLimitStatus.allowed,
  int? utilizationPercent = 8,
  String? displayName,
}) => RateLimitWindow(
  kind: kind,
  status: status,
  utilizationPercent: utilizationPercent,
  resetsAt: DateTime.utc(2026, 10, 26, 16),
  observedAt: DateTime.utc(2026, 10, 26, 12),
  displayName: displayName,
);

void main() {
  late AppLocalizations l10n;
  late FakeUsageRepository repo;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  setUp(() => repo = FakeUsageRepository());

  Future<void> pump(WidgetTester tester, {bool pumpOnce = true}) => tester.pumpApp(
    const ClaudeUsageView(),
    overrides: <Override>[usageRepositoryProvider.overrideWithValue(repo as UsageRepository)],
    pumpOnce: pumpOnce,
  );

  testWidgets('the title is always there, even while loading', (WidgetTester tester) async {
    repo.gate = Completer<void>();
    await pump(tester, pumpOnce: false);
    await tester.pump();

    expect(find.text(l10n.claudeUsageTitle), findsOneWidget);
    expect(find.text(l10n.claudeUsageLoading), findsOneWidget);
    repo.gate!.complete();
  });

  testWidgets('no reading yet says so, and offers no bar to be empty beside', (
    WidgetTester tester,
  ) async {
    repo.windows = const <RateLimitWindow>[];
    await pump(tester);

    expect(find.text(l10n.claudeUsageEmptyTitle), findsOneWidget);
  });

  testWidgets('a failure says why, with a way to try again', (WidgetTester tester) async {
    repo.failure = const NetworkFailure(traceId: 't-1');
    await pump(tester);

    expect(find.text(l10n.commonActionRetry), findsOneWidget);

    repo.failure = null;
    repo.windows = <RateLimitWindow>[_window()];
    await tester.tap(find.text(l10n.commonActionRetry));
    await tester.pumpAndSettle();

    expect(find.text(l10n.claudeUsageWindowFiveHour), findsOneWidget);
  });

  testWidgets('shows every window, by its known label and percent', (WidgetTester tester) async {
    repo.windows = <RateLimitWindow>[
      _window(kind: 'five_hour', utilizationPercent: 8),
      _window(kind: 'seven_day', status: RateLimitStatus.allowedWarning, utilizationPercent: 83),
    ];
    await pump(tester);

    expect(find.text(l10n.claudeUsageWindowFiveHour), findsOneWidget);
    expect(find.text(l10n.claudeUsageWindowSevenDay), findsOneWidget);
    expect(find.textContaining('8%'), findsOneWidget);
    expect(find.textContaining('83%'), findsOneWidget);
  });

  testWidgets('a window with no reading yet says so, never a fake 0%', (WidgetTester tester) async {
    repo.windows = <RateLimitWindow>[_window(utilizationPercent: null)];
    await pump(tester);

    expect(find.textContaining(l10n.claudeUsageNoReading), findsOneWidget);
  });

  testWidgets('a per-model window is shown by the server\'s own label, not a translated one', (
    WidgetTester tester,
  ) async {
    repo.windows = <RateLimitWindow>[_window(kind: 'model_scoped:fable', displayName: 'Fable')];
    await pump(tester);

    expect(find.text('Fable'), findsOneWidget);
  });
}
