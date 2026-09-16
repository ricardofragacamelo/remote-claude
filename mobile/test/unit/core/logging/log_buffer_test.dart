import 'package:fake_async/fake_async.dart';

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/logging/log_buffer.dart';

class _RecordingShipper implements LogShipper {
  final List<List<String>> batches = <List<String>>[];

  @override
  Future<void> send(List<String> lines) async => batches.add(lines);
}

class _FailingShipper implements LogShipper {
  int attempts = 0;

  @override
  Future<void> send(List<String> lines) async {
    attempts += 1;
    throw StateError('the network is not there');
  }
}

void main() {
  test('holds lines until the batch is full', () {
    final _RecordingShipper shipper = _RecordingShipper();
    final LogBuffer buffer = LogBuffer(shipper, size: 3);

    buffer.accept('{"level":"info"}', 'info');
    buffer.accept('{"level":"info"}', 'info');

    expect(shipper.batches, isEmpty);
    expect(buffer.pending, 2);

    buffer.accept('{"level":"info"}', 'info');

    expect(shipper.batches.single.length, 3);
    expect(buffer.pending, 0);
  });

  test('sends an error line immediately, whatever the batch holds', () {
    final _RecordingShipper shipper = _RecordingShipper();
    final LogBuffer buffer = LogBuffer(shipper, size: 50);

    buffer.accept('{"level":"info"}', 'info');
    buffer.accept('{"level":"error"}', 'error');

    expect(shipper.batches.single.length, 2);
  });

  test('sends a fatal line immediately too', () {
    final _RecordingShipper shipper = _RecordingShipper();
    LogBuffer(shipper, size: 50).accept('{"level":"fatal"}', 'fatal');

    expect(shipper.batches, hasLength(1));
  });

  test('flushing an empty buffer does nothing', () {
    final _RecordingShipper shipper = _RecordingShipper();
    LogBuffer(shipper).flush();

    expect(shipper.batches, isEmpty);
  });

  test('a failed shipment never reaches the caller', () async {
    final _FailingShipper shipper = _FailingShipper();
    final LogBuffer buffer = LogBuffer(shipper, size: 1);

    expect(() => buffer.accept('{"level":"info"}', 'info'), returnsNormally);
    await Future<void>.delayed(Duration.zero);

    expect(shipper.attempts, 1);
    expect(buffer.pending, 0);
  });

  test('the periodic flush ships what accumulated', () {
    fakeAsync((FakeAsync async) {
      final _RecordingShipper shipper = _RecordingShipper();
      final LogBuffer buffer = LogBuffer(shipper, size: 50)
        ..start(interval: const Duration(seconds: 1))
        ..accept('{"level":"info"}', 'info');

      async.elapse(const Duration(seconds: 1));

      expect(shipper.batches, hasLength(1));

      buffer.stop();
      buffer.accept('{"level":"info"}', 'info');
      async.elapse(const Duration(seconds: 5));

      expect(shipper.batches, hasLength(1));
    });
  });

  test('starting twice keeps one timer', () {
    fakeAsync((FakeAsync async) {
      final _RecordingShipper shipper = _RecordingShipper();
      LogBuffer(shipper, size: 50)
        ..start(interval: const Duration(seconds: 1))
        ..start(interval: const Duration(seconds: 1))
        ..accept('{"level":"info"}', 'info');

      async.elapse(const Duration(seconds: 1));

      expect(shipper.batches, hasLength(1));
    });
  });

  test('stopping a buffer that never started is harmless', () {
    expect(() => LogBuffer(_RecordingShipper()).stop(), returnsNormally);
  });
}
