import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/entities/session_event.dart';
import 'package:remote_claude/features/session/domain/entities/pong.dart';
import 'package:remote_claude/features/session/domain/entities/session_stream.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';

Pong pong({int seq = 1, String sessionId = 'ses-1', String nonce = 'n-1', int count = 1}) => Pong(
  seq: seq,
  sessionId: sessionId,
  pingedAt: '2026-09-14T12:00:00.000Z',
  pingCount: count,
  nonce: nonce,
);

void main() {
  group('apply', () {
    test('takes an event newer than everything applied so far', () {
      final SessionStream stream = const SessionStream().apply(pong(seq: 1));

      expect(stream.lastSeq, 1);
      expect(stream.sessionId, 'ses-1');
      expect(stream.pongs, hasLength(1));
    });

    test('discards an event the client already has — replay must not duplicate', () {
      final SessionStream stream = const SessionStream()
          .apply(pong(seq: 3))
          .apply(pong(seq: 3, nonce: 'again'));

      expect(stream.pongs, hasLength(1));
      expect(stream.lastSeq, 3);
    });

    test('discards an event older than what is applied', () {
      final SessionStream stream = const SessionStream().apply(pong(seq: 5)).apply(pong(seq: 2));

      expect(stream.pongs, hasLength(1));
      expect(stream.lastSeq, 5);
    });

    test('a whole replay of what is already held changes nothing', () {
      SessionStream stream = const SessionStream();
      for (final int seq in <int>[1, 2, 3]) {
        stream = stream.apply(pong(seq: seq, nonce: 'n-$seq'));
      }

      final SessionStream replayed = stream
          .apply(pong(seq: 2, nonce: 'n-2'))
          .apply(pong(seq: 3, nonce: 'n-3'));

      expect(replayed.pongs, hasLength(3));
      expect(replayed, stream);
    });

    test('keeps arrival order', () {
      final SessionStream stream = const SessionStream()
          .apply(pong(seq: 1, nonce: 'a'))
          .apply(pong(seq: 2, nonce: 'b'));

      expect(stream.pongs.map((Pong p) => p.nonce), <String>['a', 'b']);
    });
  });

  group('cleared', () {
    test('a gap drops everything rather than stitching a hole', () {
      final SessionStream stream = const SessionStream().apply(pong(seq: 9)).cleared();

      expect(stream.lastSeq, 0);
      expect(stream.pongs, isEmpty);
      expect(stream.sessionId, isNull);
    });
  });

  group('hasNonce', () {
    test('knows a round trip that came back', () {
      expect(const SessionStream().apply(pong(nonce: 'mine')).hasNonce('mine'), isTrue);
    });

    test('and one that did not', () {
      expect(const SessionStream().apply(pong(nonce: 'other')).hasNonce('mine'), isFalse);
    });
  });

  test('updates of the same kind are equal', () {
    // Not `const`: two identical constant expressions are one instance, and identity would
    // answer before the equality this test is about.
    // ignore_for_file: prefer_const_constructors
    final SessionEvent arrival = PongArrived(1, pong());

    expect(EventReceived(arrival), EventReceived(arrival));
    expect(StreamGap(), StreamGap());
    expect(EventReceived(arrival), isNot(StreamGap()));
    expect(StreamGap().props, isEmpty);
  });

  test('pongs compare by value, so a replay of one is not a second round trip', () {
    expect(pong(), pong());
    expect(pong(), isNot(pong(seq: 2)));
  });
}
