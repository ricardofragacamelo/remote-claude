/// A tool's whole output and a prompt's image, read when the person opens them — and how long each
/// is kept (plan 22, B-32, B-33).
library;

import 'dart:typed_data';

import 'package:fake_async/fake_async.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/domain/entities/transcript_content.dart';
import 'package:remote_claude/features/session/presentation/providers/transcript_content_controllers.dart';
import 'package:remote_claude/features/session/session_providers.dart';

import '../../../../../support/fakes/fake_transcript_content_repository.dart';

void main() {
  late FakeTranscriptContentRepository content;
  late ProviderContainer container;

  setUp(() {
    content = FakeTranscriptContentRepository()
      ..outputs['t1'] = const ToolOutput(text: 'all of it')
      ..images['u1:1'] = PromptImageBytes(bytes: Uint8List.fromList(<int>[1, 2, 3]));
    container = ProviderContainer(
      overrides: <Override>[transcriptContentRepositoryProvider.overrideWithValue(content)],
    );
  });

  tearDown(() => container.dispose());

  /// Watches [provider] like a screen does, until the test lets go.
  ProviderSubscription<T> watch<T>(ProviderListenable<T> provider) =>
      container.listen<T>(provider, (T? previous, T next) {});

  group('the whole output of a tool', () {
    test('S-113 · read once, however many look at it', () async {
      final ProviderSubscription<AsyncValue<ToolOutput>> first = watch(
        toolResultControllerProvider('c-1', 't1'),
      );
      final ProviderSubscription<AsyncValue<ToolOutput>> second = watch(
        toolResultControllerProvider('c-1', 't1'),
      );

      expect(
        await container.read(toolResultControllerProvider('c-1', 't1').future),
        const ToolOutput(text: 'all of it'),
      );
      expect(content.toolReads, <(String, String)>[('c-1', 't1')]);

      first.close();
      second.close();
    });

    test('S-113 · kept for a while after the card goes, then let go', () {
      fakeAsync((FakeAsync async) {
        watch(toolResultControllerProvider('c-1', 't1')).close();
        async.flushMicrotasks();

        async.elapse(toolOutputKeptFor - const Duration(seconds: 1));
        watch(toolResultControllerProvider('c-1', 't1')).close();
        async.flushMicrotasks();
        expect(content.toolReads, hasLength(1));

        async.elapse(toolOutputKeptFor + const Duration(seconds: 1));
        watch(toolResultControllerProvider('c-1', 't1')).close();
        async.flushMicrotasks();
        expect(content.toolReads, hasLength(2));
      });
    });

    test('S-115 · a failure is not asked again on its own; "try again" asks once more', () async {
      content.failure = const NetworkFailure(traceId: 't');
      final ProviderSubscription<AsyncValue<ToolOutput>> held = watch(
        toolResultControllerProvider('c-1', 't1'),
      );
      addTearDown(held.close);

      await expectLater(
        container.read(toolResultControllerProvider('c-1', 't1').future),
        throwsA(isA<NetworkFailure>()),
      );
      await Future<void>.delayed(const Duration(milliseconds: 50));
      expect(content.toolReads, hasLength(1));

      content.failure = null;
      container.read(toolResultControllerProvider('c-1', 't1').notifier).retry();

      expect(
        await container.read(toolResultControllerProvider('c-1', 't1').future),
        const ToolOutput(text: 'all of it'),
      );
      expect(content.toolReads, hasLength(2));
    });
  });

  group('the image of a prompt', () {
    test('S-119 · read when opened, and let go when the screen that shows it closes', () async {
      final ProviderSubscription<AsyncValue<PromptImageBytes>> held = watch(
        promptImageControllerProvider('c-1', 'u1:1'),
      );

      expect(
        (await container.read(promptImageControllerProvider('c-1', 'u1:1').future)).bytes,
        <int>[1, 2, 3],
      );
      held.close();
      await Future<void>.delayed(Duration.zero);

      final ProviderSubscription<AsyncValue<PromptImageBytes>> again = watch(
        promptImageControllerProvider('c-1', 'u1:1'),
      );
      addTearDown(again.close);
      await container.read(promptImageControllerProvider('c-1', 'u1:1').future);

      // Nothing of the bytes outlived the screen: opened again, they are read again.
      expect(content.imageReads, <(String, String)>[('c-1', 'u1:1'), ('c-1', 'u1:1')]);
    });

    test('S-120 · a refusal is not asked again on its own; "try again" asks once more', () async {
      content.failure = const NetworkFailure(traceId: 't');
      final ProviderSubscription<AsyncValue<PromptImageBytes>> held = watch(
        promptImageControllerProvider('c-1', 'u1:1'),
      );
      addTearDown(held.close);

      await expectLater(
        container.read(promptImageControllerProvider('c-1', 'u1:1').future),
        throwsA(isA<NetworkFailure>()),
      );
      await Future<void>.delayed(const Duration(milliseconds: 50));
      expect(content.imageReads, hasLength(1));

      content.failure = null;
      container.read(promptImageControllerProvider('c-1', 'u1:1').notifier).retry();
      await container.read(promptImageControllerProvider('c-1', 'u1:1').future);

      expect(content.imageReads, hasLength(2));
    });
  });
}
