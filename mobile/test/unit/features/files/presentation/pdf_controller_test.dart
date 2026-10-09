import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';
import 'package:remote_claude/features/files/files_providers.dart';
import 'package:remote_claude/features/files/presentation/engines/pdf_engine.dart';
import 'package:remote_claude/features/files/presentation/providers/pdf_controller.dart';

import '../../../../support/fakes/fake_files_repository.dart';
import '../../../../support/fakes/fake_pdf_engine.dart';
import '../../../../support/fakes/recording_writer.dart';

void main() {
  late FakePdfEngine engine;
  late RecordingWriter log;
  late ProviderContainer container;

  setUp(() {
    engine = FakePdfEngine();
    log = RecordingWriter();
    final AppLogger logger = AppLogger(
      context: const LogContext(appVersion: '0.0.1', platform: 'android'),
      writer: log.writer,
    );
    addTearDown(logger.dispose);
    container = ProviderContainer(
      overrides: <Override>[
        filesRepositoryProvider.overrideWithValue(FakeFilesRepository()),
        pdfEngineProvider.overrideWithValue(engine),
        appLoggerProvider.overrideWithValue(logger),
      ],
    );
    addTearDown(container.dispose);
  });

  PdfView view() => container.read(pdfDocumentControllerProvider('/w', 'a.pdf'));
  PdfDocumentController controller() =>
      container.read(pdfDocumentControllerProvider('/w', 'a.pdf').notifier);

  Future<void> open() async {
    container.listen(pdfDocumentControllerProvider('/w', 'a.pdf'), (_, _) {});
    await Future<void>.delayed(Duration.zero);
  }

  test('opens the document, on page 1, and follows the page on screen', () async {
    await open();

    expect(view().opening, isA<PdfOpened>());
    expect(view().page, 1);
    controller().pageChanged(5);
    expect(view().page, 5);
  });

  test('S-115 · a locked document waits for its password; the right one opens it', () async {
    engine
      ..opening = const PdfLocked()
      ..passwords['spike'] = PdfOpened(FakePdfHandle());
    await open();
    expect(view().opening, isA<PdfLocked>());

    await controller().unlock('nope');
    expect(view().opening, isA<PdfWrongPassword>());

    await controller().unlock('spike');
    expect(view().opening, isA<PdfOpened>());
    expect(engine.tried, <String?>[null, 'nope', 'spike']);
  });

  test('S-118 · the password is kept nowhere: not in the state, not in the log', () async {
    engine.opening = const PdfLocked();
    await open();

    await controller().unlock('s3cret-password');

    expect(view().props.toString(), isNot(contains('s3cret-password')));
    expect(jsonEncode(log.records), isNot(contains('s3cret-password')));
  });

  test(
    'a refusal of the server before the engine is the failure, and "try again" asks again',
    () async {
      engine.failure = const NetworkFailure(traceId: 't');
      await open();
      expect(view().failure, isA<NetworkFailure>());

      engine.failure = null;
      await controller().retry();
      expect(view().opening, isA<PdfOpened>());
    },
  );

  test('a document that opens after the viewer left is closed at once', () async {
    final FakePdfHandle handle = FakePdfHandle();
    final Completer<void> opened = Completer<void>();
    engine
      ..opening = PdfOpened(handle)
      ..opened = opened;

    container.listen(pdfDocumentControllerProvider('/w', 'a.pdf'), (_, _) {}).close();
    await Future<void>.delayed(Duration.zero);
    opened.complete();
    await Future<void>.delayed(Duration.zero);

    expect(handle.closed, isTrue);
  });

  test('leaving the viewer closes the document', () async {
    final FakePdfHandle handle = FakePdfHandle();
    engine.opening = PdfOpened(handle);
    final ProviderSubscription<PdfView> watching = container.listen(
      pdfDocumentControllerProvider('/w', 'a.pdf'),
      (_, _) {},
    );
    await Future<void>.delayed(Duration.zero);

    watching.close();
    await Future<void>.delayed(Duration.zero);

    expect(handle.closed, isTrue);
  });
}
