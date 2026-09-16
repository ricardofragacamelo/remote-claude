import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/network/contracts/frame_codec.dart';
import 'package:remote_claude/core/network/contracts/protocol.g.dart';

import '../../../../support/builders/frames.dart';

void main() {
  group('decodeEnvelope', () {
    test('reads a valid frame', () {
      final Envelope? envelope = decodeEnvelope(sessionPong(sessionId: 'ses-1', seq: 3));

      expect(envelope, isNotNull);
      expect(envelope!.type, 'session.pong');
      expect(envelope.seq, 3);
      expect(envelope.sessionId, 'ses-1');
    });

    test('accepts a field it has never heard of — a published app outlives its server', () {
      const String raw =
          '{"v":1,"id":"a","kind":"event","type":"session.pong",'
          '"ts":"2026-09-14T12:00:00.000Z","futureField":"whatever"}';

      expect(decodeEnvelope(raw), isNotNull);
    });

    test('refuses a frame missing an envelope field', () {
      const String raw = '{"v":1,"id":"a","kind":"event","ts":"2026-09-14T12:00:00.000Z"}';

      expect(decodeEnvelope(raw), isNull);
    });

    test('refuses a frame whose envelope field is the wrong type', () {
      const String raw =
          '{"v":"one","id":"a","kind":"event","type":"x",'
          '"ts":"2026-09-14T12:00:00.000Z"}';

      expect(decodeEnvelope(raw), isNull);
    });

    test('refuses something that is not JSON at all', () {
      expect(decodeEnvelope('not json'), isNull);
    });

    test('refuses JSON that is not an object', () {
      expect(decodeEnvelope('[1,2,3]'), isNull);
    });
  });

  test('encodeEnvelope leaves the absent optional fields out', () {
    final String encoded = encodeEnvelope(
      const Envelope(
        v: protocolVersion,
        id: 'a',
        kind: 'command',
        type: 'session.ping',
        ts: '2026-09-14T12:00:00.000Z',
      ),
    );

    expect(encoded, isNot(contains('seq')));
    expect(encoded, contains('session.ping'));
  });
}
