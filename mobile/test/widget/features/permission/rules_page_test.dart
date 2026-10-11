/// The rules screen: the four states, the reach of every rule, and taking one back.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/widgets/agent_names.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_rule.dart';
import 'package:remote_claude/features/permission/domain/repositories/permission_rule_repository.dart';
import 'package:remote_claude/features/permission/permission.dart';
import 'package:remote_claude/features/permission/permission_providers.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/fakes/fake_permission_rule_repository.dart';
import '../../../support/pump_app.dart';

final DateTime now = DateTime.utc(2026, 9, 24, 12);

const ServerFailure unexpected = ServerFailure(
  code: 'INTERNAL_ERROR',
  messageKey: 'common.error.unexpected',
  traceId: 'trace-9',
);

void main() {
  late AppLocalizations l10n;
  late FakePermissionRuleRepository rules;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  Future<void> pumpRules(
    WidgetTester tester, {
    List<PermissionRule>? granted,
    Object? failure,
    Locale locale = const Locale('en'),
    AgentNames agents = AgentNames.none,
  }) async {
    rules = FakePermissionRuleRepository(rules: granted ?? <PermissionRule>[aPermissionRule()])
      ..listFailure = failure;

    await tester.pumpApp(
      const RulesPage(),
      locale: locale,
      overrides: <Override>[
        permissionRuleRepositoryProvider.overrideWithValue(rules as PermissionRuleRepository),
        permissionClockProvider.overrideWithValue(() => now),
      ],
      builder: (BuildContext context, Widget? child) =>
          AgentNamesScope(names: agents, child: child!),
    );
    await tester.pumpAndSettle();
  }

  /// The date as the row writes it.
  String shown(WidgetTester tester, DateTime at) => MaterialLocalizations.of(
    tester.element(find.byType(RulesPage)),
  ).formatMediumDate(at.toLocal());

  Finder rowOf(String pattern) => find.bySemanticsLabel(l10n.rulesRowLabel(pattern));

  group('the four states', () {
    testWidgets('shows the failure with its trace, and the retry recovers', (
      WidgetTester tester,
    ) async {
      await pumpRules(tester, failure: unexpected);

      expect(find.textContaining('trace-9'), findsOneWidget);

      rules.listFailure = null;
      await tester.tap(find.text(l10n.commonActionRetry));
      await tester.pumpAndSettle();

      expect(find.text('shell(git status)'), findsOneWidget);
    });

    // S-18 — an empty list explains what a rule is; otherwise it reads as a failure.
    testWidgets('with no rule, explains what one is', (WidgetTester tester) async {
      await pumpRules(tester, granted: <PermissionRule>[]);

      expect(find.text(l10n.rulesEmptyTitle), findsOneWidget);
      expect(find.text(l10n.rulesEmptyBody(l10n.engineNameFallback)), findsOneWidget);
    });
  });

  // S-15 — scope, tool, pattern, author, date and validity, on every row.
  testWidgets('every row says how far the rule reaches, who granted it, and until when', (
    WidgetTester tester,
  ) async {
    final PermissionRule project = aPermissionRule(
      id: 'p',
      scope: PermissionScope.project,
      kind: 'file.write',
      pattern: 'file.write(notes.md)',
      decision: PermissionDecision.deny,
      projectPath: '/srv/app',
    );
    await pumpRules(tester, granted: <PermissionRule>[aPermissionRule(), project]);

    expect(find.text(l10n.rulesDescription(l10n.engineNameFallback)), findsOneWidget);
    expect(find.text(l10n.rulesScopeAlways), findsOneWidget);
    expect(find.text(l10n.rulesScopeProject), findsOneWidget);
    expect(find.text('shell(git status)'), findsOneWidget);
    expect(find.text('file.write(notes.md)'), findsOneWidget);
    // The kind by its short name, never the engine's name for a tool (plan 28, F5).
    expect(
      find.text(l10n.rulesToolDecision(l10n.sessionKindShell, l10n.rulesDecisionAllow)),
      findsOneWidget,
    );
    expect(
      find.text(l10n.rulesToolDecision(l10n.sessionKindFileWrite, l10n.rulesDecisionDeny)),
      findsOneWidget,
    );
    expect(find.text(l10n.rulesProject('/srv/app')), findsOneWidget);
    expect(
      find.text(l10n.rulesGranted('user-1', shown(tester, DateTime.utc(2026, 9, 20, 10)))),
      findsNWidgets(2),
    );
    expect(
      find.text(l10n.rulesValidUntil(shown(tester, DateTime.utc(2026, 12, 19, 10)))),
      findsNWidgets(2),
    );
    expect(find.text(l10n.rulesStatusActive), findsNWidgets(2));
  });

  // S-66 — the warning before a session starts asking again, and the expired one still there.
  testWidgets('warns about a rule close to expiring, and keeps an expired one, marked', (
    WidgetTester tester,
  ) async {
    final DateTime soon = now.add(const Duration(days: 2));
    final DateTime gone = now.subtract(const Duration(days: 3));
    await pumpRules(
      tester,
      granted: <PermissionRule>[
        aPermissionRule(expiresAt: soon),
        aPermissionRule(
          id: 'old',
          pattern: 'shell(ls)',
          expiresAt: gone,
          status: RuleStatus.expired,
        ),
        aPermissionRule(id: 'odd', pattern: 'shell(pwd)', status: RuleStatus.unknown),
      ],
    );

    expect(
      find.text(l10n.rulesExpiringSoon(l10n.engineNameFallback, shown(tester, soon))),
      findsOneWidget,
    );
    expect(find.text(l10n.rulesStatusExpired), findsOneWidget);
    expect(
      find.text(l10n.rulesExpiredOn(l10n.engineNameFallback, shown(tester, gone))),
      findsOneWidget,
    );

    // The list is lazy, and the third row starts below the fold.
    await tester.scrollUntilVisible(
      find.text(l10n.rulesStatusUnknown),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text(l10n.rulesStatusUnknown), findsOneWidget);
  });

  // Plan 28, F5 — a kind this build has no words for is named by the generic name, never a blank.
  testWidgets('names a kind it does not know by the generic name, and a rule of no kind too', (
    WidgetTester tester,
  ) async {
    await pumpRules(
      tester,
      granted: <PermissionRule>[
        aPermissionRule(kind: 'vcs.commit', pattern: 'vcs.commit'),
        aPermissionRule(id: 'none', kind: null, pattern: 'search'),
      ],
    );

    expect(find.text('vcs.commit'), findsOneWidget);
    expect(
      find.text(l10n.rulesToolDecision(l10n.sessionKindOther, l10n.rulesDecisionAllow)),
      findsNWidgets(2),
    );
  });

  // Plan 28, S-98 · D-18 — the rule the update could not carry over: listed, explained, revocable.
  group('a disabled rule', () {
    const AgentNames agents = AgentNames(
      names: <String, String>{'claude': 'Claude Code', 'codex': 'Codex'},
      defaultEngine: 'claude',
    );

    PermissionRule disabled({String? engine}) => aPermissionRule(
      id: 'off',
      kind: null,
      pattern: 'Bash(npm run *)',
      status: RuleStatus.disabled,
      engine: engine,
      disabledReason: 'untranslatable',
    );

    testWidgets('shows its old pattern, that it is disabled, why — and only the way to revoke it', (
      WidgetTester tester,
    ) async {
      await pumpRules(tester, granted: <PermissionRule>[disabled()], agents: agents);

      expect(find.text('Bash(npm run *)'), findsOneWidget);
      expect(find.text(l10n.rulesStatusDisabled), findsOneWidget);
      expect(
        find.text(
          'Written for Claude Code in a form this version cannot translate: it no longer '
          'applies. Create it again if you still want it.',
        ),
        findsOneWidget,
      );
      // It answers nothing: no kind it never had, no decision, no validity to count down.
      expect(find.textContaining(l10n.rulesDecisionAllow), findsNothing);
      expect(
        find.text(l10n.rulesValidUntil(shown(tester, DateTime.utc(2026, 12, 19, 10)))),
        findsNothing,
      );
      expect(find.byType(OutlinedButton), findsOneWidget);
      expect(find.text(l10n.rulesRevoke), findsOneWidget);
    });

    testWidgets('names the agent it was restricted to, in the language of the phone', (
      WidgetTester tester,
    ) async {
      await pumpRules(
        tester,
        granted: <PermissionRule>[disabled(engine: 'codex')],
        agents: agents,
        locale: const Locale('pt'),
      );
      final AppLocalizations pt = await AppLocalizations.delegate.load(const Locale('pt'));

      expect(find.text(pt.rulesStatusDisabled), findsOneWidget);
      expect(
        find.text(
          'Escrita para o Codex numa forma que esta versão não traduz: não vale mais. Crie de '
          'novo se ainda quiser.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('is revoked with one tap, like any other', (WidgetTester tester) async {
      await pumpRules(tester, granted: <PermissionRule>[disabled()], agents: agents);

      await tester.tap(find.text(l10n.rulesRevoke));
      await tester.pumpAndSettle();

      expect(rules.revoked, <String>['off']);
      expect(find.text('Bash(npm run *)'), findsNothing);
    });
  });

  // S-16 — one tap, and the row leaves.
  testWidgets('revoking takes the row off the list', (WidgetTester tester) async {
    await pumpRules(
      tester,
      granted: <PermissionRule>[
        aPermissionRule(),
        aPermissionRule(id: 'b', pattern: 'shell(ls)'),
      ],
    );

    await tester.tap(find.text(l10n.rulesRevoke).first);
    await tester.pumpAndSettle();

    expect(rules.revoked, <String>['rule_1']);
    expect(find.text('shell(git status)'), findsNothing);
    expect(find.text('shell(ls)'), findsOneWidget);
  });

  // S-69 — the second tap on a row being revoked is nothing.
  testWidgets('a second tap while revoking revokes nothing', (WidgetTester tester) async {
    await pumpRules(tester);
    rules.holdRevocations = true;

    await tester.tap(find.text(l10n.rulesRevoke));
    await tester.pump();
    await tester.tap(find.text(l10n.rulesRevoking), warnIfMissed: false);
    await tester.pump();

    expect(rules.revoked, <String>['rule_1']);
    final OutlinedButton button = tester.widget<OutlinedButton>(
      find.ancestor(of: find.text(l10n.rulesRevoking), matching: find.byType(OutlinedButton)),
    );
    expect(button.onPressed, isNull);

    rules.releaseRevocations();
    await tester.pumpAndSettle();
    expect(find.text('shell(git status)'), findsNothing);
  });

  // S-21 — the rule is still answering; the row stays, and says why it could not go.
  testWidgets('a failed revocation keeps the row and says why, translated', (
    WidgetTester tester,
  ) async {
    await pumpRules(tester);
    rules.revokeFailure = unexpected;

    await tester.tap(find.text(l10n.rulesRevoke));
    await tester.pumpAndSettle();

    expect(find.text('shell(git status)'), findsOneWidget);
    expect(find.text(l10n.commonErrorUnexpected), findsOneWidget);
    expect(find.text(l10n.rulesRevoke), findsOneWidget);
  });

  // S-20 — rules are read, not pushed: reading again shows what another device granted.
  testWidgets('reading the list again shows a rule granted on another device', (
    WidgetTester tester,
  ) async {
    await pumpRules(tester);
    rules.rules = <PermissionRule>[
      aPermissionRule(),
      aPermissionRule(id: 'web', pattern: 'shell(npm test)'),
    ];

    await tester.tap(find.byTooltip(l10n.rulesReload));
    await tester.pumpAndSettle();

    expect(find.text('shell(npm test)'), findsOneWidget);
    expect(rules.listed, 2);
  });

  testWidgets('every row has an accessible name that says which rule it is', (
    WidgetTester tester,
  ) async {
    final SemanticsHandle semantics = tester.ensureSemantics();
    await pumpRules(tester);

    expect(rowOf('shell(git status)'), findsOneWidget);
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    semantics.dispose();
  });

  testWidgets('speaks the language of the phone', (WidgetTester tester) async {
    await pumpRules(tester, locale: const Locale('pt'));
    final AppLocalizations pt = await AppLocalizations.delegate.load(const Locale('pt'));

    expect(find.text(pt.rulesTitle), findsOneWidget);
    expect(find.text(pt.rulesScopeAlways), findsOneWidget);
    expect(find.text(pt.rulesRevoke), findsOneWidget);
  });
}
