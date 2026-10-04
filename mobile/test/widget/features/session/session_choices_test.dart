/// The mode, the model and the effort chips, and the sheets they open (plan 10, B-11).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/domain/entities/insight.dart';
import 'package:remote_claude/features/session/presentation/widgets/composer_bar.dart';
import 'package:remote_claude/features/session/presentation/widgets/session_choices.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/pump_app.dart';

const InstallationModel opus = InstallationModel(
  value: 'opus',
  displayName: 'Opus',
  description: 'The largest',
  effortLevels: <String>['low', 'high', 'turbo'],
);
const InstallationModel sonnet = InstallationModel(value: 'sonnet', displayName: 'Sonnet');

/// Mounts the chip [build] makes, as the bar draws it.
Future<void> pumpChip(WidgetTester tester, ComposerChoice? Function(BuildContext) build) =>
    tester.pumpApp(
      Builder(
        builder: (BuildContext context) {
          final ComposerChoice? choice = build(context);
          return choice == null ? const Text('no chip') : ChoiceChipButton(choice: choice);
        },
      ),
    );

void main() {
  late AppLocalizations l10n;
  late List<Object?> picked;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  setUp(() => picked = <Object?>[]);

  group('the mode', () {
    testWidgets('S-33 · offers ask, accept edits and plan — never bypassing every question', (
      WidgetTester tester,
    ) async {
      await pumpChip(
        tester,
        (BuildContext context) => modeChoice(context, current: null, onPick: picked.add),
      );

      expect(find.text(l10n.modeDefault), findsOneWidget);
      await tester.tap(find.text(l10n.modeDefault));
      await tester.pumpAndSettle();

      expect(find.text(l10n.modePlan), findsOneWidget);
      expect(find.text(l10n.modeAcceptEdits), findsOneWidget);
      expect(find.textContaining('bypass'), findsNothing);
      // The warning is said in full where it is chosen.
      expect(find.textContaining(l10n.modeAcceptEditsWarning), findsOneWidget);

      await tester.tap(find.text(l10n.modePlan));
      await tester.pumpAndSettle();
      expect(picked, <Object?>['plan']);
    });

    testWidgets(
      'S-33 · accept edits looks different: a warning icon and its words, not only a colour',
      (WidgetTester tester) async {
        await pumpChip(
          tester,
          (BuildContext context) => modeChoice(context, current: 'acceptEdits', onPick: picked.add),
        );

        expect(find.text(l10n.modeAcceptEdits), findsOneWidget);
        expect(find.byIcon(Icons.warning_amber), findsOneWidget);
      },
    );

    testWidgets('picking what is already chosen sends nothing', (WidgetTester tester) async {
      await pumpChip(
        tester,
        (BuildContext context) => modeChoice(context, current: 'plan', onPick: picked.add),
      );

      await tester.tap(find.text(l10n.modePlan));
      await tester.pumpAndSettle();
      await tester.tap(find.text(l10n.modePlan).last);
      await tester.pumpAndSettle();

      expect(picked, isEmpty);
    });

    testWidgets('S-35 · with a change pending, the chip says so and nothing can be picked', (
      WidgetTester tester,
    ) async {
      await pumpChip(
        tester,
        (BuildContext context) =>
            modeChoice(context, current: 'plan', onPick: picked.add, isPending: true),
      );

      expect(find.text(l10n.composerChoicePending), findsOneWidget);
      await tester.tap(find.text(l10n.composerChoicePending));
      await tester.pumpAndSettle();
      await tester.tap(find.text(l10n.modeDefault));
      await tester.pumpAndSettle();

      expect(picked, isEmpty);
    });

    test('a mode this build has no words for is shown as it is', () async {
      final AppLocalizations en = await englishCatalogue();
      expect(modeName(en, 'auto'), 'auto');
      expect(modeDescription(en, 'auto'), isEmpty);
    });
  });

  group('the model', () {
    testWidgets('lists the installation’s models, and a pick is the model’s value', (
      WidgetTester tester,
    ) async {
      await pumpChip(
        tester,
        (BuildContext context) => modelChoice(
          context,
          current: 'sonnet',
          known: const <InstallationModel>[opus, sonnet],
          models: (WidgetRef ref) =>
              const AsyncValue<List<InstallationModel>>.data(<InstallationModel>[opus, sonnet]),
          onPick: picked.add,
        ),
      );

      expect(find.text('Sonnet'), findsOneWidget);
      await tester.tap(find.text('Sonnet'));
      await tester.pumpAndSettle();

      expect(find.text('The largest'), findsOneWidget);
      expect(find.text(l10n.modelDefault), findsNothing);
      await tester.tap(find.text('Opus'));
      await tester.pumpAndSettle();

      expect(picked, <Object?>['opus']);
    });

    testWidgets('in a draft the installation’s default is a choice too', (
      WidgetTester tester,
    ) async {
      await pumpChip(
        tester,
        (BuildContext context) => modelChoice(
          context,
          current: 'opus',
          known: const <InstallationModel>[opus],
          withDefault: true,
          models: (WidgetRef ref) =>
              const AsyncValue<List<InstallationModel>>.data(<InstallationModel>[opus]),
          onPick: picked.add,
        ),
      );

      await tester.tap(find.text('Opus'));
      await tester.pumpAndSettle();
      await tester.tap(find.text(l10n.modelDefault));
      await tester.pumpAndSettle();

      expect(picked, <Object?>[null]);
    });

    testWidgets('a model nobody listed is shown by its value; none at all is the default', (
      WidgetTester tester,
    ) async {
      await pumpChip(
        tester,
        (BuildContext context) => modelChoice(
          context,
          current: 'claude-x',
          known: const <InstallationModel>[],
          models: (WidgetRef ref) => const AsyncValue<List<InstallationModel>>.loading(),
          onPick: picked.add,
        ),
      );
      expect(find.text('claude-x'), findsOneWidget);

      await tester.tap(find.text('claude-x'));
      await tester.pumpAndSettle();
      expect(find.text(l10n.modelsLoading), findsOneWidget);

      expect(modelName(l10n, null, const <InstallationModel>[]), l10n.modelDefault);
    });

    testWidgets('S-21 · a list that could not be read says why, and keeps the model in use', (
      WidgetTester tester,
    ) async {
      await pumpChip(
        tester,
        (BuildContext context) => modelChoice(
          context,
          current: 'sonnet',
          known: const <InstallationModel>[],
          models: (WidgetRef ref) => const AsyncValue<List<InstallationModel>>.error(
            ServerFailure(
              code: 'SESSION_LIMIT_REACHED',
              messageKey: 'session.error.limitReached',
              traceId: 't',
              params: <String, String>{'limit': '3'},
            ),
            StackTrace.empty,
          ),
          onPick: picked.add,
        ),
      );

      await tester.tap(find.text('sonnet'));
      await tester.pumpAndSettle();

      expect(find.text(l10n.modelsFailed(l10n.sessionErrorLimitReached('3'))), findsOneWidget);
    });

    testWidgets('something that is not a failure still says the list could not be read', (
      WidgetTester tester,
    ) async {
      await pumpChip(
        tester,
        (BuildContext context) => modelChoice(
          context,
          current: 'sonnet',
          known: const <InstallationModel>[],
          models: (WidgetRef ref) =>
              AsyncValue<List<InstallationModel>>.error(StateError('x'), StackTrace.empty),
          onPick: picked.add,
        ),
      );

      await tester.tap(find.text('sonnet'));
      await tester.pumpAndSettle();

      expect(find.text(l10n.modelsFailed(l10n.commonErrorUnexpected)), findsOneWidget);
    });
  });

  group('the effort', () {
    testWidgets('a model that takes none has no chip', (WidgetTester tester) async {
      await pumpChip(
        tester,
        (BuildContext context) => effortChoice(context, model: sonnet, current: null),
      );
      expect(find.text('no chip'), findsOneWidget);

      await pumpChip(
        tester,
        (BuildContext context) => effortChoice(context, model: null, current: null),
      );
      expect(find.text('no chip'), findsOneWidget);
    });

    testWidgets('S-34 · in a draft, the levels the model takes, by name', (
      WidgetTester tester,
    ) async {
      await pumpChip(
        tester,
        (BuildContext context) =>
            effortChoice(context, model: opus, current: null, onPick: picked.add),
      );

      await tester.tap(find.text(l10n.effortDefault));
      await tester.pumpAndSettle();

      expect(find.text(l10n.effortLow), findsOneWidget);
      expect(find.text('turbo'), findsOneWidget);
      await tester.tap(find.text(l10n.effortHigh));
      await tester.pumpAndSettle();

      expect(picked, <Object?>['high']);
    });

    testWidgets('S-34 · in a live session it is read-only, and the sheet says why', (
      WidgetTester tester,
    ) async {
      await pumpChip(
        tester,
        (BuildContext context) => effortChoice(context, model: opus, current: 'high'),
      );

      await tester.tap(find.text(l10n.effortHigh));
      await tester.pumpAndSettle();

      expect(find.text(l10n.effortReadOnly), findsOneWidget);
      expect(find.text(l10n.effortLow), findsNothing);
    });

    testWidgets('a session not opened here says it runs the effort it started with', (
      WidgetTester tester,
    ) async {
      await pumpChip(
        tester,
        (BuildContext context) => effortChoice(context, model: opus, current: null, isKnown: false),
      );

      expect(find.text(l10n.effortUnknown), findsOneWidget);
    });

    test('every level the contract names has a name', () async {
      final AppLocalizations en = await englishCatalogue();
      expect(
        <String?>[
          null,
          'low',
          'medium',
          'high',
          'xhigh',
          'max',
        ].map((String? level) => effortName(en, level)),
        <String>[
          en.effortDefault,
          en.effortLow,
          en.effortMedium,
          en.effortHigh,
          en.effortXhigh,
          en.effortMax,
        ],
      );
    });
  });
}
