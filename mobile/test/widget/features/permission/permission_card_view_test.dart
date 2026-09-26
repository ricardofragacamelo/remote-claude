/// The card that authorises a command on somebody's machine: what it shows, and what one tap does.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_queue.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';
import 'package:remote_claude/features/permission/presentation/widgets/permission_card_view.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/builders/permissions.dart';
import '../../../support/pump_app.dart';

/// What the card asked for, in order.
typedef Tap = (PermissionDecision, PermissionScope);

void main() {
  late AppLocalizations l10n;
  late List<Tap> taps;
  late int disarms;
  late int extensions;
  late int rulesOpened;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  Future<void> pumpCard(
    WidgetTester tester, {
    PermissionCard? card,
    AnswerBlock? block,
    bool canApprove = true,
    String? notice,
    ThemeData? theme,
    bool withRules = false,
  }) async {
    taps = <Tap>[];
    disarms = 0;
    extensions = 0;
    rulesOpened = 0;

    await tester.pumpApp(
      SingleChildScrollView(
        child: PermissionCardView(
          card: card ?? PermissionCard(request: aPermissionRequest(), frameId: 'frame-1'),
          now: t0,
          block: block,
          canApprove: canApprove,
          notice: notice,
          onAnswer: (PermissionDecision decision, PermissionScope scope) =>
              taps.add((decision, scope)),
          onDisarm: () => disarms += 1,
          onExtend: () => extensions += 1,
          onOpenRules: withRules ? () => rulesOpened += 1 : null,
        ),
      ),
      theme: theme,
    );
  }

  ButtonStyleButton buttonWith(WidgetTester tester, String label) =>
      tester.widget<ButtonStyleButton>(
        find.ancestor(of: find.text(label), matching: find.bySubtype<ButtonStyleButton>()).first,
      );

  bool enabled(WidgetTester tester, String label) => buttonWith(tester, label).onPressed != null;

  // S-39 — exactly what will run, in full.
  group('the command', () {
    testWidgets('is on screen whole, monospaced', (WidgetTester tester) async {
      await pumpCard(tester);

      final SelectableText text = tester.widget<SelectableText>(find.byType(SelectableText));
      expect(text.data, 'rm -rf build/');
      expect(text.style?.fontFamily, 'monospace');
      expect(text.maxLines, isNull);
    });

    testWidgets('a long one is never cut, and scrolls both ways', (WidgetTester tester) async {
      final String long = List<String>.generate(40, (int i) => 'rm -rf dir$i').join(' && ');
      await pumpCard(
        tester,
        card: PermissionCard(
          request: aPermissionRequest(description: long),
          frameId: 'f',
        ),
      );

      expect(tester.widget<SelectableText>(find.byType(SelectableText)).data, long);
      final Iterable<Scrollable> scrollables = tester.widgetList<Scrollable>(
        find.descendant(of: find.byType(PermissionCardView), matching: find.byType(Scrollable)),
      );
      expect(
        scrollables.map((Scrollable scrollable) => scrollable.axisDirection),
        containsAll(<AxisDirection>[AxisDirection.down, AxisDirection.right]),
      );
    });
  });

  // S-40 — risk is legible at a glance, in both themes, and not only by colour.
  group('a destructive request', () {
    for (final (String name, ThemeData theme) in <(String, ThemeData)>[
      ('light', AppTheme.light()),
      ('dark', AppTheme.dark()),
    ]) {
      testWidgets('carries the error colour of the $name scheme', (WidgetTester tester) async {
        await pumpCard(tester, theme: theme);

        final Card card = tester.widget<Card>(find.byType(Card));
        final RoundedRectangleBorder shape = card.shape! as RoundedRectangleBorder;
        expect(shape.side.color, theme.colorScheme.error);
        expect(find.byIcon(Icons.warning_amber_rounded), findsOneWidget);
        expect(find.text(l10n.permissionRiskDestructive), findsOneWidget);
      });
    }

    testWidgets('and a harmless one does not', (WidgetTester tester) async {
      await pumpCard(
        tester,
        card: PermissionCard(
          request: aPermissionRequest(riskHint: RiskHint.read, toolName: 'Read'),
          frameId: 'f',
        ),
      );

      final RoundedRectangleBorder shape =
          tester.widget<Card>(find.byType(Card)).shape! as RoundedRectangleBorder;
      expect(shape.side.color, isNot(AppTheme.light().colorScheme.error));
      expect(find.text(l10n.permissionRiskRead), findsOneWidget);
      expect(find.text(l10n.permissionToolRead), findsOneWidget);
    });
  });

  testWidgets('says how long is left before silence refuses', (WidgetTester tester) async {
    await pumpCard(tester);

    expect(find.text(l10n.permissionRemaining(120)), findsOneWidget);
  });

  testWidgets('names a tool it has no words for', (WidgetTester tester) async {
    await pumpCard(
      tester,
      card: PermissionCard(
        request: aPermissionRequest(toolName: 'Grep'),
        frameId: 'f',
      ),
    );

    expect(find.text(l10n.permissionToolUnknown('Grep')), findsOneWidget);
  });

  testWidgets('every yes says what it reaches, and for how long', (WidgetTester tester) async {
    await pumpCard(tester);

    expect(find.text(l10n.permissionScopeOnceHint), findsOneWidget);
    expect(find.text(l10n.permissionScopeSessionHint), findsOneWidget);
  });

  // S-42 — "no" is the easiest target when the server leans that way.
  testWidgets('refusing is the larger target, above every yes', (WidgetTester tester) async {
    await pumpCard(tester);

    final Rect refuse = tester.getRect(find.text(l10n.permissionDeny));
    final Rect refuseButton = tester.getRect(
      find.ancestor(of: find.text(l10n.permissionDeny), matching: find.byType(FilledButton)),
    );
    final Rect allowButton = tester.getRect(
      find.ancestor(of: find.text(l10n.permissionScopeOnce), matching: find.byType(OutlinedButton)),
    );

    expect(refuseButton.width, greaterThan(allowButton.width));
    expect(refuse.top, lessThan(allowButton.top));
  });

  testWidgets('without that lean, refusing is not filled either', (WidgetTester tester) async {
    await pumpCard(
      tester,
      card: PermissionCard(request: aPermissionRequest(defaultToNo: false), frameId: 'f'),
    );

    expect(
      find.ancestor(of: find.text(l10n.permissionDeny), matching: find.byType(OutlinedButton)),
      findsOneWidget,
    );
  });

  group('tapping', () {
    testWidgets('refuse asks for a refusal', (WidgetTester tester) async {
      await pumpCard(tester);

      await tester.tap(find.text(l10n.permissionDeny));

      expect(taps, <Tap>[(PermissionDecision.deny, PermissionScope.once)]);
    });

    testWidgets('a yes asks for that yes, with its scope', (WidgetTester tester) async {
      await pumpCard(tester);

      await tester.tap(find.text(l10n.permissionScopeSession));

      expect(taps, <Tap>[(PermissionDecision.allow, PermissionScope.session)]);
    });

    // S-41 — the second step, with going back as the larger target.
    testWidgets('the second step confirms the yes that was armed, or backs out', (
      WidgetTester tester,
    ) async {
      await pumpCard(
        tester,
        card: PermissionCard(
          request: aPermissionRequest(),
          frameId: 'f',
          phase: CardPhase.confirming,
        ),
      );

      expect(find.text(l10n.permissionConfirmTitle), findsOneWidget);
      expect(find.text(l10n.permissionDeny), findsNothing);

      await tester.tap(find.text(l10n.permissionConfirmAction));
      await tester.tap(find.text(l10n.permissionConfirmCancel));

      expect(taps, <Tap>[(PermissionDecision.allow, PermissionScope.once)]);
      expect(disarms, 1);
    });
  });

  // Plan 03, B-10 — a yes that outlives the session, and the second step that says how far.
  group('a yes that persists a rule', () {
    const RuleOffer ninetyDays = RuleOffer(
      pattern: 'Bash(git status)',
      lifetime: Duration(days: 90),
    );

    PermissionRequest offering({RiskHint risk = RiskHint.read, RuleOffer rule = ninetyDays}) =>
        aPermissionRequest(
          riskHint: risk,
          description: 'git status',
          scopes: const <PermissionScope>[
            PermissionScope.once,
            PermissionScope.session,
            PermissionScope.project,
            PermissionScope.always,
          ],
          rule: rule,
        );

    testWidgets('each one says what it reaches, and for how long, before it is tapped', (
      WidgetTester tester,
    ) async {
      await pumpCard(
        tester,
        card: PermissionCard(request: offering(), frameId: 'f'),
      );

      final String days = l10n.permissionRuleDays(90);
      expect(find.text(l10n.permissionScopeProject), findsOneWidget);
      expect(find.text(l10n.permissionScopeProjectHint(days)), findsOneWidget);
      expect(find.text(l10n.permissionScopeAlways), findsOneWidget);
      expect(find.text(l10n.permissionScopeAlwaysHint(days)), findsOneWidget);
    });

    // S-17 — the reach with all the letters: which command, where, for how long.
    testWidgets('`always` is armed first, and the second step says its reach in full', (
      WidgetTester tester,
    ) async {
      await pumpCard(
        tester,
        card: PermissionCard(request: offering(), frameId: 'f'),
      );
      await tester.tap(find.text(l10n.permissionScopeAlways));
      expect(taps, <Tap>[(PermissionDecision.allow, PermissionScope.always)]);

      // The controller arms it (S-65); the card, still the same card, now shows the second step.
      await pumpCard(
        tester,
        card: PermissionCard(request: offering(), frameId: 'f', phase: CardPhase.confirming),
        withRules: true,
      );

      expect(find.text(l10n.permissionPersistTitle), findsOneWidget);
      expect(find.text(l10n.permissionPersistAlways(l10n.permissionRuleDays(90))), findsOneWidget);
      expect(
        tester
            .widgetList<SelectableText>(find.byType(SelectableText))
            .map((SelectableText t) => t.data),
        contains('Bash(git status)'),
      );
      expect(find.text(l10n.permissionPersistRevocable), findsOneWidget);
      // Not destructive, so no warning about destruction — the reach is the whole message.
      expect(find.text(l10n.permissionConfirmTitle), findsNothing);

      await tester.tap(find.text(l10n.permissionPersistConfirm));
      await tester.tap(find.text(l10n.permissionPersistOpenRules));
      await tester.tap(find.text(l10n.permissionConfirmCancel));

      expect(taps, <Tap>[(PermissionDecision.allow, PermissionScope.always)]);
      expect(rulesOpened, 1);
      expect(disarms, 1);
    });

    testWidgets('`project` says it holds in this project', (WidgetTester tester) async {
      await pumpCard(
        tester,
        card: PermissionCard(request: offering(), frameId: 'f'),
      );
      await tester.tap(find.text(l10n.permissionScopeProject));
      await pumpCard(
        tester,
        card: PermissionCard(request: offering(), frameId: 'f', phase: CardPhase.confirming),
      );

      expect(find.text(l10n.permissionPersistProject(l10n.permissionRuleDays(90))), findsOneWidget);
      // With nowhere to go, no way to the rules is offered — the note still says they exist.
      expect(find.text(l10n.permissionPersistOpenRules), findsNothing);
      expect(find.text(l10n.permissionPersistRevocable), findsOneWidget);
    });

    testWidgets('a destructive one says both: the danger, and the reach', (
      WidgetTester tester,
    ) async {
      final PermissionRequest request = offering(risk: RiskHint.destructive);
      await pumpCard(
        tester,
        card: PermissionCard(request: request, frameId: 'f'),
      );
      await tester.tap(find.text(l10n.permissionScopeAlways));
      await pumpCard(
        tester,
        card: PermissionCard(request: request, frameId: 'f', phase: CardPhase.confirming),
      );

      expect(find.text(l10n.permissionConfirmTitle), findsOneWidget);
      expect(find.text(l10n.permissionPersistTitle), findsOneWidget);
    });

    testWidgets('a lifetime shorter than a day is said in hours, never as zero days', (
      WidgetTester tester,
    ) async {
      await pumpCard(
        tester,
        card: PermissionCard(
          request: offering(
            rule: const RuleOffer(pattern: 'Bash(git status)', lifetime: Duration(minutes: 20)),
          ),
          frameId: 'f',
        ),
      );

      expect(
        find.text(l10n.permissionScopeAlwaysHint(l10n.permissionRuleHours(1))),
        findsOneWidget,
      );
    });

    testWidgets('an ephemeral yes armed by a destructive request shows no reach', (
      WidgetTester tester,
    ) async {
      await pumpCard(
        tester,
        card: PermissionCard(
          request: aPermissionRequest(),
          frameId: 'f',
          phase: CardPhase.confirming,
        ),
      );

      expect(find.text(l10n.permissionPersistTitle), findsNothing);
      expect(find.text(l10n.permissionConfirmAction), findsOneWidget);
    });
  });

  group('extending', () {
    testWidgets('more time asks for it', (WidgetTester tester) async {
      await pumpCard(tester);

      await tester.tap(find.text(l10n.permissionExtend));

      expect(extensions, 1);
    });
  });

  // S-65 — at the ceiling the action is gone, and the card says so.
  testWidgets('a request that cannot be extended again says so instead', (
    WidgetTester tester,
  ) async {
    await pumpCard(
      tester,
      card: PermissionCard(request: aPermissionRequest(), frameId: 'f', extensionRefused: true),
    );

    expect(find.text(l10n.permissionExtend), findsNothing);
    expect(find.text(l10n.permissionExtendExhausted), findsOneWidget);
  });

  // S-48 — while an answer is on its way, nothing else can be tapped.
  testWidgets('a card that is sending takes no tap, and says why', (WidgetTester tester) async {
    await pumpCard(
      tester,
      card: PermissionCard(request: aPermissionRequest(), frameId: 'f', phase: CardPhase.sending),
    );

    expect(enabled(tester, l10n.permissionDeny), isFalse);
    expect(enabled(tester, l10n.permissionScopeOnce), isFalse);
    expect(enabled(tester, l10n.permissionExtend), isFalse);
    expect(find.text(l10n.permissionSending), findsOneWidget);
  });

  group('a card that cannot be answered says why', () {
    for (final (AnswerBlock block, String Function(AppLocalizations) reason)
        in <(AnswerBlock, String Function(AppLocalizations))>[
          // S-84 — a phone that may watch and may not decide.
          (AnswerBlock.device, (AppLocalizations l10n) => l10n.permissionDeviceBlocked),
          // S-86 — no connection for an answer to leave on.
          (AnswerBlock.offline, (AppLocalizations l10n) => l10n.permissionOffline),
          (AnswerBlock.connecting, (AppLocalizations l10n) => l10n.permissionConnecting),
        ]) {
      testWidgets('${block.name}: every answer off, with the reason', (WidgetTester tester) async {
        await pumpCard(tester, block: block);

        expect(enabled(tester, l10n.permissionDeny), isFalse);
        expect(enabled(tester, l10n.permissionScopeOnce), isFalse);
        expect(enabled(tester, l10n.permissionExtend), isFalse);
        expect(find.text(reason(l10n)), findsOneWidget);
      });
    }

    // S-83 — no lock: refusing stays, approving goes, and the screen says what to do.
    testWidgets('no lock: refusing stays possible, approving does not', (
      WidgetTester tester,
    ) async {
      await pumpCard(tester, canApprove: false);

      expect(enabled(tester, l10n.permissionDeny), isTrue);
      expect(enabled(tester, l10n.permissionScopeOnce), isFalse);
      expect(find.text(l10n.permissionNoLockTitle), findsOneWidget);
      expect(find.text(l10n.permissionNoLockBody), findsOneWidget);
    });

    testWidgets('no lock also stops the second step', (WidgetTester tester) async {
      await pumpCard(
        tester,
        canApprove: false,
        card: PermissionCard(
          request: aPermissionRequest(),
          frameId: 'f',
          phase: CardPhase.confirming,
        ),
      );

      expect(enabled(tester, l10n.permissionConfirmAction), isFalse);
    });
  });

  testWidgets('what the last tap came to is on the card', (WidgetTester tester) async {
    await pumpCard(tester, notice: l10n.permissionLockRefused);

    expect(find.text(l10n.permissionLockRefused), findsOneWidget);
  });

  // S-85 — at 200 % the command is still whole, and the card meets the guidelines.
  testWidgets('at twice the text size the command is whole and the targets are big enough', (
    WidgetTester tester,
  ) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final SemanticsHandle semantics = tester.ensureSemantics();

    await pumpCard(tester);

    expect(tester.widget<SelectableText>(find.byType(SelectableText)).data, 'rm -rf build/');
    expect(tester.takeException(), isNull);
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    semantics.dispose();
  });
}
