/// The image of a prompt: a marker in the conversation, opened on demand on a screen of its own
/// (plan 22, B-33).
library;

import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/domain/entities/conversation.dart';
import 'package:remote_claude/features/session/domain/entities/transcript_content.dart';
import 'package:remote_claude/features/session/presentation/widgets/conversation_view.dart';
import 'package:remote_claude/features/session/presentation/widgets/image_marker.dart';
import 'package:remote_claude/features/session/session_providers.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

import '../../../support/builders/images.dart';
import '../../../support/fakes/fake_transcript_content_repository.dart';
import '../../../support/pump_app.dart';

/// The smallest PNG there is: one transparent pixel.
const PromptImage png = PromptImage(blockId: 'u1:1', mediaType: 'image/png', size: 48213);

void main() {
  late AppLocalizations l10n;
  late FakeTranscriptContentRepository content;

  setUpAll(() async {
    l10n = await englishCatalogue();
  });

  setUp(() => content = FakeTranscriptContentRepository());

  Future<void> pump(WidgetTester tester, Widget child) => tester.pumpApp(
    child,
    overrides: <Override>[transcriptContentRepositoryProvider.overrideWithValue(content)],
  );

  Future<void> open(WidgetTester tester) async {
    await tester.tap(find.text(l10n.sessionImageOpen));
    await tester.pumpAndSettle();
  }

  group('S-118 · the marker', () {
    testWidgets('says it is an image, its type and its size', (WidgetTester tester) async {
      await pump(tester, const ImageMarker(image: png, conversationId: 'c-1'));

      expect(find.text(l10n.sessionImageAttachedWith('PNG, 48.2 kB')), findsOneWidget);
      expect(find.text(l10n.sessionImageOpen), findsOneWidget);
      expect(content.imageReads, isEmpty);
    });

    test('says only what the prompt said of it', () {
      expect(imageLabel(l10n, const PromptImage(), 'en'), l10n.sessionImageAttached);
      expect(
        imageLabel(l10n, const PromptImage(mediaType: 'image/webp'), 'en'),
        l10n.sessionImageAttachedWith('WEBP'),
      );
      expect(
        imageLabel(l10n, const PromptImage(mediaType: 'image', size: 999), 'en'),
        l10n.sessionImageAttachedWith('999 byte'),
      );
      expect(
        imageLabel(l10n, const PromptImage(mediaType: 'image/', size: 1000), 'pt'),
        l10n.sessionImageAttachedWith('1 kB'),
      );
    });

    testWidgets('an image that cannot be asked for is the marker alone', (
      WidgetTester tester,
    ) async {
      await pump(tester, const ImageMarker(image: png));
      expect(find.text(l10n.sessionImageOpen), findsNothing);

      await pump(
        tester,
        const ImageMarker(
          image: PromptImage(mediaType: 'image/png'),
          conversationId: 'c-1',
        ),
      );
      expect(find.text(l10n.sessionImageOpen), findsNothing);
      expect(find.text(l10n.sessionImageAttachedWith('PNG')), findsOneWidget);
    });

    testWidgets('S-118 · in a prompt, below its text — and S-121 a prompt of only an image has no '
        'empty text', (WidgetTester tester) async {
      await pump(
        tester,
        const ConversationView(
          conversationId: 'c-1',
          conversation: Conversation(
            entries: <ConversationEntry>[
              StreamMessage(
                messageId: 'u1',
                blocks: <String>['what is wrong here?'],
                isFromUser: true,
                images: <PromptImage>[png],
              ),
              StreamMessage(
                messageId: 'u2',
                isFromUser: true,
                images: <PromptImage>[PromptImage(blockId: 'u2:0')],
              ),
            ],
          ),
        ),
      );

      expect(
        tester.getTopLeft(find.text('what is wrong here?')).dy,
        lessThan(tester.getTopLeft(find.text(l10n.sessionImageAttachedWith('PNG, 48.2 kB'))).dy),
      );
      expect(find.text(l10n.sessionImageAttached), findsOneWidget);
      expect(find.text(''), findsNothing);
      expect(find.byType(ImageMarker), findsNWidgets(2));
    });
  });

  group('S-119 · opening it', () {
    testWidgets('reads it then — not before — and shows it from memory, on a screen of its own', (
      WidgetTester tester,
    ) async {
      content.images['u1:1'] = PromptImageBytes(bytes: onePixel, mediaType: 'image/png');
      content.gate = Completer<void>();
      await pump(tester, const ImageMarker(image: png, conversationId: 'c-1'));

      await tester.tap(find.text(l10n.sessionImageOpen));
      await tester.pump();
      expect(find.text(l10n.sessionImageLoading), findsOneWidget);
      expect(find.text(l10n.sessionImageDescription), findsOneWidget);

      content.gate!.complete();
      await tester.pumpAndSettle();

      expect(content.imageReads, <(String, String)>[('c-1', 'u1:1')]);
      final Image shown = tester.widget<Image>(find.byType(Image));
      expect(shown.image, isA<MemoryImage>());
      expect(shown.semanticLabel, l10n.sessionImageAlt);
    });

    testWidgets('closing lets the bytes go: opened again, it is read again', (
      WidgetTester tester,
    ) async {
      content.images['u1:1'] = PromptImageBytes(bytes: onePixel, mediaType: 'image/png');
      await pump(tester, const ImageMarker(image: png, conversationId: 'c-1'));

      await open(tester);
      await tester.tap(find.byTooltip(l10n.sessionImageClose));
      await tester.pumpAndSettle();
      expect(find.byType(PromptImageScreen), findsNothing);

      await open(tester);

      expect(content.imageReads, hasLength(2));
    });

    testWidgets('bytes that are no image say so, in words', (WidgetTester tester) async {
      content.images['u1:1'] = PromptImageBytes(bytes: Uint8List.fromList(<int>[1, 2, 3]));
      await pump(tester, const ImageMarker(image: png, conversationId: 'c-1'));

      await tester.runAsync(() async {
        await tester.tap(find.text(l10n.sessionImageOpen));
        await tester.pumpAndSettle();
        await Future<void>.delayed(const Duration(milliseconds: 200));
      });
      await tester.pumpAndSettle();

      expect(find.text(l10n.commonErrorUnexpected), findsOneWidget);
    });
  });

  group('S-120 · the route refuses', () {
    final Map<String, (Failure, String)> refusals = <String, (Failure, String)>{
      '415': (
        const ServerFailure(
          code: 'UNSUPPORTED_MEDIA_TYPE',
          messageKey: 'transcript.error.imageTypeUnsupported',
          traceId: 't',
          params: <String, String>{'mediaType': 'image/svg+xml'},
        ),
        'This image cannot be shown here: image/svg+xml is not a type the server serves.',
      ),
      '413': (
        const ServerFailure(
          code: 'PAYLOAD_TOO_LARGE',
          messageKey: 'transcript.error.imageTooLarge',
          traceId: 't',
        ),
        'This image is too large to show here.',
      ),
      '404': (
        const ServerFailure(
          code: 'NOT_FOUND',
          messageKey: 'transcript.error.notFound',
          traceId: 't',
        ),
        'That conversation does not exist, or it is not yours to read.',
      ),
    };

    for (final MapEntry<String, (Failure, String)> refusal in refusals.entries) {
      testWidgets('${refusal.key}: the message in the place of the image, and no "try again"', (
        WidgetTester tester,
      ) async {
        content.failure = refusal.value.$1;
        await pump(tester, const ImageMarker(image: png, conversationId: 'c-1'));
        await open(tester);

        expect(find.text(refusal.value.$2), findsOneWidget);
        expect(find.text(l10n.commonActionRetry), findsNothing);
        expect(find.byType(Image), findsNothing);
      });
    }

    testWidgets('the network: the message, and "try again" reads it again', (
      WidgetTester tester,
    ) async {
      content.failure = const NetworkFailure(traceId: 't');
      await pump(tester, const ImageMarker(image: png, conversationId: 'c-1'));
      await open(tester);

      expect(find.text(l10n.commonErrorOffline), findsOneWidget);

      content
        ..failure = null
        ..images['u1:1'] = PromptImageBytes(bytes: onePixel);
      await tester.tap(find.text(l10n.commonActionRetry));
      await tester.pumpAndSettle();

      expect(content.imageReads, hasLength(2));
      expect(find.text(l10n.commonErrorOffline), findsNothing);
      expect(find.byType(Image), findsOneWidget);
    });
  });
}
