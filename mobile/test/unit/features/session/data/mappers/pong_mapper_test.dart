import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/network/contracts/frame_codec.dart';
import 'package:remote_claude/core/network/contracts/protocol.g.dart';
import 'package:remote_claude/features/session/data/mappers/pong_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/pong.dart';

import '../../../../../support/builders/frames.dart';

Envelope envelope(String raw) => decodeEnvelope(raw)!;

void main() {
  test('reads a pong frame as the entity', () {
    final Pong? pong = pongFrom(envelope(diagPong(sessionId: 'ses-1', seq: 4, pingCount: 2)));

    expect(pong, isNotNull);
    expect(pong!.seq, 4);
    expect(pong.sessionId, 'ses-1');
    expect(pong.pingCount, 2);
    expect(pong.nonce, 'nonce-1');
  });

  test('a frame of another type is not a pong', () {
    expect(pongFrom(envelope(connectionReady())), isNull);
  });

  // Built as an object rather than decoded from the wire: since the contract made `seq` mandatory
  // on every event, [decodeEnvelope] refuses this frame at the edge and the mapper never sees it
  // (that half is in frame_codec_test.dart). The mapper keeps its own guard anyway — it is called
  // with envelopes this app builds too, and a mapper that trusts its caller is a mapper that
  // produces a Pong with no place in the stream.
  test('an event with no seq is not a pong — seq is what replay needs', () {
    const Envelope seqless = Envelope(
      v: protocolVersion,
      id: 'a',
      kind: 'event',
      type: diagPongType,
      ts: '2026-09-14T12:00:00.000Z',
      payload: <String, Object?>{
        'sessionId': 'ses-1',
        'pingedAt': 't',
        'pingCount': 1,
        'nonce': 'n',
      },
    );

    expect(pongFrom(seqless), isNull);
  });

  test('an event with no payload is not a pong', () {
    expect(pongFrom(envelope(frame(kind: 'event', type: 'diag.pong', seq: 1))), isNull);
  });

  test('a payload missing a field is not a pong', () {
    final String raw = frame(
      kind: 'event',
      type: 'diag.pong',
      seq: 1,
      payload: <String, Object?>{'sessionId': 'ses-1'},
    );

    expect(pongFrom(envelope(raw)), isNull);
  });

  test('a payload with a field of the wrong type is not a pong', () {
    final String raw = frame(
      kind: 'event',
      type: 'diag.pong',
      seq: 1,
      payload: <String, Object?>{
        'sessionId': 'ses-1',
        'pingedAt': 't',
        'pingCount': 'two',
        'nonce': 'n',
      },
    );

    expect(pongFrom(envelope(raw)), isNull);
  });
}
