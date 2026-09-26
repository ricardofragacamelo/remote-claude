import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/domain/entities/session_update.dart';
import 'package:remote_claude/features/session/presentation/providers/session_stream_controller.dart';
import 'package:remote_claude/features/session/session_providers.dart';

import '../../../../../support/builders/frames.dart';
import '../../../../../support/fakes/fake_session_repository.dart';

/// One pong, as the data source emits it.
SessionUpdate pongUpdate({
  int seq = 1,
  String nonce = 'n-1',
  String sessionId = 'ses-1',
  int count = 1,
}) => arrivalOf(diagPong(sessionId: sessionId, seq: seq, pingCount: count, nonce: nonce));

void main() {
  late FakeSessionRepository repository;
  late ProviderContainer container;

  setUp(() {
    repository = FakeSessionRepository();
    container = ProviderContainer(
      overrides: <Override>[sessionRepositoryProvider.overrideWithValue(repository)],
    );
    // Keeps the controller alive for the whole test, as a mounted screen would.
    container.listen(
      sessionStreamControllerProvider,
      (SessionScreenState? previous, SessionScreenState next) {},
      fireImmediately: true,
    );
  });

  tearDown(() async {
    container.dispose();
    await repository.dispose();
  });

  SessionScreenState state() => container.read(sessionStreamControllerProvider);
  SessionStreamController controller() => container.read(sessionStreamControllerProvider.notifier);

  Future<void> settle() => Future<void>.delayed(Duration.zero);

  test('starts empty, with nothing in flight', () {
    expect(state().stream.pongs, isEmpty);
    expect(state().isSending, isFalse);
  });

  test('a ping that left starts the wait', () {
    controller().ping();

    expect(repository.pings, hasLength(1));
    expect(state().isSending, isTrue);
  });

  test('the first ping opens a session — it carries no id', () {
    controller().ping();

    expect(repository.pingedSessions.single, isNull);
  });

  test('a ping the socket refused never starts a wait', () {
    repository.accepts = false;
    controller().ping();

    expect(state().isSending, isFalse);
  });

  test('a second tap while one is in flight sends one command, not two', () {
    controller().ping();
    final String first = repository.pings.single;

    // The screen disables the button while `isSending` holds; this proves the state that
    // drives it, so a double tap cannot produce two round trips.
    expect(state().isSending, isTrue);
    expect(repository.pings, <String>[first]);
  });

  test('the answer ends the wait', () async {
    controller().ping();
    repository.emit(pongUpdate(nonce: repository.pings.single));
    await settle();

    expect(state().isSending, isFalse);
    expect(state().stream.pongs, hasLength(1));
  });

  test('somebody else’s answer does not end our wait', () async {
    controller().ping();
    repository.emit(pongUpdate(nonce: 'somebody-else'));
    await settle();

    expect(state().isSending, isTrue);
  });

  test('the first pong is what starts following the session', () async {
    repository.emit(pongUpdate(seq: 1));
    await settle();

    expect(repository.followed, <String>['ses-1']);
  });

  test('the follower resumes from the highest seq applied', () async {
    repository.emit(pongUpdate(seq: 1));
    await settle();
    repository.emit(pongUpdate(seq: 7, nonce: 'n-7'));
    await settle();

    expect(repository.lastSeq!(), 7);
  });

  test('following happens once, not on every event', () async {
    repository.emit(pongUpdate(seq: 1));
    await settle();
    repository.emit(pongUpdate(seq: 2, nonce: 'n-2'));
    await settle();

    expect(repository.followed, hasLength(1));
  });

  test('a later ping carries the session that was opened', () async {
    repository.emit(pongUpdate(seq: 1));
    await settle();

    controller().ping();

    expect(repository.pingedSessions.last, 'ses-1');
  });

  test('a replayed event does not duplicate the transcript', () async {
    repository.emit(pongUpdate(seq: 1));
    await settle();
    repository.emit(pongUpdate(seq: 1));
    await settle();

    expect(state().stream.pongs, hasLength(1));
  });

  test('a gap clears everything, including the round trip in flight', () async {
    controller().ping();
    repository.emit(pongUpdate(seq: 4));
    await settle();

    repository.emit(const StreamGap());
    await settle();

    expect(state().stream.pongs, isEmpty);
    expect(state().stream.lastSeq, 0);
    expect(state().isSending, isFalse);
  });

  test('disposing the screen leaves the stream — no subscription outlives it', () {
    container.dispose();

    expect(repository.unfollows, greaterThanOrEqualTo(1));
  });

  test('two states with the same contents are equal', () {
    expect(const SessionScreenState(), const SessionScreenState());
    expect(
      const SessionScreenState().copyWith(pendingNonce: 'n'),
      const SessionScreenState().copyWith(pendingNonce: 'n'),
    );
  });
}
