/// How the screens name an engine: by the display name the backend gave it (plan 28, B-13).
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/error/failure_messages.dart';
import 'package:remote_claude/core/widgets/agent_names.dart';
import 'package:remote_claude/core/widgets/error_view.dart';
import 'package:remote_claude/core/widgets/failure_line.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/pump_app.dart';

const AgentNames known = AgentNames(
  names: <String, String>{'engine-a': 'Agent A', 'engine-b': 'Agent B'},
  defaultEngine: 'engine-a',
);

const Failure unavailable = ServerFailure(
  code: 'AGENT_UNAVAILABLE',
  messageKey: 'session.error.agentUnavailable',
  traceId: 't',
  params: <String, String>{'engine': 'engine-b'},
);

/// Says what [AgentNamesScope.of] answers where it is built, and how many times it was built.
class _Reader extends StatelessWidget {
  const _Reader(this.builds);

  final List<AgentNames> builds;

  @override
  Widget build(BuildContext context) {
    final AgentNames names = AgentNamesScope.of(context);
    builds.add(names);
    return Text(names.nameOf('engine-b'));
  }
}

void main() {
  late AppLocalizations l10n;

  setUpAll(() async => l10n = await englishCatalogue());

  group('the names', () {
    test('an engine the list knows is named by its display name', () {
      expect(known.nameOf('engine-b'), 'Agent B');
    });

    test('an engine the list does not know is named by its id — never an empty gap', () {
      expect(known.nameOf('engine-z'), 'engine-z');
      expect(AgentNames.none.nameOf('engine-a'), 'engine-a');
    });

    test('a sentence that names no engine names the default one', () {
      expect(known.nameOf(null), 'Agent A');
      expect(known.nameOf(''), 'Agent A');
      expect(
        const AgentNames(names: <String, String>{}, defaultEngine: 'engine-x').nameOf(null),
        'engine-x',
      );
    });

    test('with nothing known and nothing named there is no name to say', () {
      expect(AgentNames.none.nameOf(null), '');
    });

    test('two lists that say the same are equal', () {
      expect(
        known,
        const AgentNames(
          names: <String, String>{'engine-a': 'Agent A', 'engine-b': 'Agent B'},
          defaultEngine: 'engine-a',
        ),
      );
      expect(known, isNot(AgentNames.none));
    });
  });

  group('the scope', () {
    testWidgets('a widget reads the names put above it', (WidgetTester tester) async {
      final List<AgentNames> builds = <AgentNames>[];
      await tester.pumpApp(AgentNamesScope(names: known, child: _Reader(builds)));

      expect(find.text('Agent B'), findsOneWidget);
    });

    testWidgets('with nothing above, there are no names, and the id is said', (
      WidgetTester tester,
    ) async {
      final List<AgentNames> builds = <AgentNames>[];
      await tester.pumpApp(_Reader(builds));

      expect(find.text('engine-b'), findsOneWidget);
    });

    testWidgets('the list arriving rebuilds who reads it — the same list does not', (
      WidgetTester tester,
    ) async {
      final List<AgentNames> builds = <AgentNames>[];
      final _Reader reader = _Reader(builds);

      await tester.pumpApp(AgentNamesScope(names: AgentNames.none, child: reader));
      await tester.pumpApp(AgentNamesScope(names: known, child: reader));
      expect(find.text('Agent B'), findsOneWidget);
      final int afterArrival = builds.length;

      await tester.pumpApp(
        AgentNamesScope(
          names: const AgentNames(
            names: <String, String>{'engine-a': 'Agent A', 'engine-b': 'Agent B'},
            defaultEngine: 'engine-a',
          ),
          child: reader,
        ),
      );
      expect(builds.length, afterArrival);
    });
  });

  group('S-115 · a text of the core says the display name, in both languages (B-40)', () {
    late AppLocalizations pt;

    setUpAll(() async => pt = await AppLocalizations.delegate.load(const Locale('pt')));

    test('a sentence names the engine by its display name, or the default one without it', () {
      expect(known.said(l10n, 'engine-b'), 'Agent B');
      expect(known.said(l10n), 'Agent A');
      expect(known.said(pt, 'engine-z'), 'engine-z');
    });

    test('with no name known, the word for an agent fills it — never an empty gap', () {
      expect(AgentNames.none.said(l10n), l10n.engineNameFallback);
      expect(AgentNames.none.said(pt), pt.engineNameFallback);
      expect(l10n.engineNameFallback, isNotEmpty);
      expect(pt.engineNameFallback, isNotEmpty);
    });

    testWidgets('agentNameIn reads the names above, in English', (WidgetTester tester) async {
      await tester.pumpApp(
        AgentNamesScope(
          names: known,
          child: Builder(
            builder: (BuildContext context) => Text(
              AppLocalizations.of(context).sessionDotWaiting(agentNameIn(context, 'engine-b')),
            ),
          ),
        ),
      );

      expect(find.text('Agent B is waiting for your answer'), findsOneWidget);
    });

    testWidgets('and in Portuguese, the same name in the sentence of the language', (
      WidgetTester tester,
    ) async {
      await tester.pumpApp(
        AgentNamesScope(
          names: known,
          child: Builder(
            builder: (BuildContext context) =>
                Text(AppLocalizations.of(context).composerPlaceholder(agentNameIn(context))),
          ),
        ),
        locale: const Locale('pt'),
      );

      expect(find.text('Peça ao Agent A algo nesta pasta…'), findsOneWidget);
    });

    testWidgets('with nothing above — signed out —, the sentence still reads whole', (
      WidgetTester tester,
    ) async {
      await tester.pumpApp(
        Builder(
          builder: (BuildContext context) =>
              Text(AppLocalizations.of(context).authSignInDescription(agentNameIn(context))),
        ),
      );

      expect(find.text(l10n.authSignInDescription(l10n.engineNameFallback)), findsOneWidget);
    });

    test('a refusal that names no engine names the default one, or the word for an agent', () {
      const Failure rejected = ServerFailure(
        code: 'INVALID_INPUT',
        messageKey: 'session.error.forkRejected',
        traceId: 't',
      );
      const Failure unknown = ServerFailure(
        code: 'INVALID_INPUT',
        messageKey: 'session.error.unknownCommand',
        traceId: 't',
        params: <String, String>{'command': '/nope', 'engine': 'engine-b'},
      );

      expect(
        translateFailure(l10n, rejected, agents: known),
        l10n.sessionErrorForkRejected('Agent A'),
      );
      expect(
        translateFailure(l10n, rejected),
        l10n.sessionErrorForkRejected(l10n.engineNameFallback),
      );
      expect(
        translateFailure(l10n, unknown, agents: known),
        l10n.sessionErrorUnknownCommand('Agent B', '/nope'),
      );
    });
  });

  group('S-40 · a refusal about the engine, on screen', () {
    testWidgets('the error state names the engine by the names above it', (
      WidgetTester tester,
    ) async {
      await tester.pumpApp(
        const AgentNamesScope(
          names: known,
          child: ErrorView(failure: unavailable),
        ),
      );

      expect(find.text(l10n.sessionErrorAgentUnavailable('Agent B')), findsOneWidget);
    });

    testWidgets('the line beside a control says it the same way', (WidgetTester tester) async {
      await tester.pumpApp(
        const AgentNamesScope(
          names: known,
          child: FailureLine(failure: unavailable),
        ),
      );

      expect(find.text(l10n.sessionErrorAgentUnavailable('Agent B')), findsOneWidget);
    });

    testWidgets('failureText is translateFailure with the names of the context', (
      WidgetTester tester,
    ) async {
      late String said;
      await tester.pumpApp(
        AgentNamesScope(
          names: known,
          child: Builder(
            builder: (BuildContext context) {
              said = failureText(context, unavailable);
              return const SizedBox.shrink();
            },
          ),
        ),
      );

      expect(said, translateFailure(l10n, unavailable, agents: known));
    });
  });
}
