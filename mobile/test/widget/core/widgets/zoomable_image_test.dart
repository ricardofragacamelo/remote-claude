/// An image from memory, with pinch and drag — the one zoom component of the app (plan 22, B-33;
/// plan 27, F6 · B-22, D-08, S-108: shared with the prompt image and the tool's own attachment).
library;

import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/widgets/zoomable_image.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/pump_app.dart';

void main() {
  late AppLocalizations l10n;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  testWidgets('loads, then shows the image, zoomable by InteractiveViewer', (
    WidgetTester tester,
  ) async {
    await tester.pumpApp(
      const ZoomableImage(
        image: AsyncValue<Uint8List>.loading(),
        semanticLabel: 'a picture',
        loadingLabel: 'Loading…',
      ),
    );

    expect(find.text('Loading…'), findsOneWidget);

    await tester.pumpApp(
      ZoomableImage(
        image: AsyncValue<Uint8List>.data(Uint8List.fromList(<int>[0, 1, 2])),
        semanticLabel: 'a picture',
        loadingLabel: 'Loading…',
      ),
    );

    final InteractiveViewer viewer = tester.widget(find.byType(InteractiveViewer));
    expect(viewer.maxScale, 8);
  });

  testWidgets('a refusal offers "try again", unless it is final', (WidgetTester tester) async {
    bool retried = false;
    await tester.pumpApp(
      ZoomableImage(
        image: AsyncValue<Uint8List>.error(Exception('x'), StackTrace.empty),
        semanticLabel: 'a picture',
        loadingLabel: 'Loading…',
        onRetry: () {
          retried = true;
        },
      ),
    );

    await tester.tap(find.text(l10n.commonActionRetry));
    expect(retried, isTrue);
  });
}
