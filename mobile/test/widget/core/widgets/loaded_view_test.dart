/// The four states, in the one widget that renders them.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/widgets/loaded_view.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/pump_app.dart';

const LoadedLabels labels = LoadedLabels(
  loading: 'Loading the things',
  emptyTitle: 'No things',
  emptyDescription: 'Nothing has been added yet.',
);

void main() {
  late AppLocalizations l10n;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  Future<void> pumpView(
    WidgetTester tester,
    AsyncValue<List<String>> value, {
    VoidCallback? onRetry,
    bool Function(List<String> value)? isEmpty,
  }) => tester.pumpApp(
    LoadedView<List<String>>(
      value: value,
      labels: labels,
      onRetry: onRetry,
      isEmpty: isEmpty,
      builder: (List<String> things) => Text(things.join(', ')),
    ),
  );

  testWidgets('says what is being waited for', (WidgetTester tester) async {
    await pumpView(tester, const AsyncLoading<List<String>>());

    expect(find.text(labels.loading), findsOneWidget);
  });

  testWidgets('renders the failure with its trace', (WidgetTester tester) async {
    await pumpView(
      tester,
      const AsyncError<List<String>>(NetworkFailure(traceId: 'trace-5'), StackTrace.empty),
    );

    expect(find.textContaining('trace-5'), findsOneWidget);
  });

  testWidgets('an error that is not a Failure still renders something showable', (
    WidgetTester tester,
  ) async {
    await pumpView(tester, AsyncError<List<String>>(StateError('raw'), StackTrace.empty));

    // Above `data/` a raw exception has no code and nothing to translate, and the screen still
    // owes the person a sentence.
    expect(find.text(l10n.commonErrorUnexpected), findsOneWidget);
  });

  // The state this widget is careful about — a build that failed while the provider is still
  // settling, which Riverpod reports as a loading state **carrying** an error — cannot be
  // constructed here: the constructor for it is internal to the package. It is pinned end to end
  // by the device banner's test, which drives a real provider that throws.

  testWidgets('offers the retry only when there is one', (WidgetTester tester) async {
    await pumpView(
      tester,
      const AsyncError<List<String>>(NetworkFailure(traceId: 't'), StackTrace.empty),
    );
    expect(find.text(l10n.commonActionRetry), findsNothing);

    int retries = 0;
    await pumpView(
      tester,
      const AsyncError<List<String>>(NetworkFailure(traceId: 't'), StackTrace.empty),
      onRetry: () => retries += 1,
    );

    await tester.tap(find.text(l10n.commonActionRetry));
    expect(retries, 1);
  });

  testWidgets('says it is empty when the caller says what empty means', (
    WidgetTester tester,
  ) async {
    await pumpView(
      tester,
      const AsyncData<List<String>>(<String>[]),
      isEmpty: (List<String> things) => things.isEmpty,
    );

    expect(find.text(labels.emptyTitle), findsOneWidget);
  });

  testWidgets('without that question, nothing is ever empty', (WidgetTester tester) async {
    await pumpView(tester, const AsyncData<List<String>>(<String>[]));

    expect(find.text(labels.emptyTitle), findsNothing);
  });

  testWidgets('shows the content once there is some', (WidgetTester tester) async {
    await pumpView(
      tester,
      const AsyncData<List<String>>(<String>['one', 'two']),
      isEmpty: (List<String> things) => things.isEmpty,
    );

    expect(find.text('one, two'), findsOneWidget);
  });
}
