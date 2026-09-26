/// The permission repository over its data sources.
library;

import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/logging/app_logger.dart';
import 'package:remote_claude/core/logging/log_context.dart';
import 'package:remote_claude/core/network/trace.dart';
import 'package:remote_claude/core/network/ws_client.dart';
import 'package:remote_claude/features/permission/data/datasources/permission_api_data_source.dart';
import 'package:remote_claude/features/permission/data/datasources/permission_ws_data_source.dart';
import 'package:remote_claude/features/permission/data/repositories/permission_repository_impl.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_lookup.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_outcome.dart';
import 'package:remote_claude/features/permission/domain/entities/permission_request.dart';
import 'package:remote_claude/features/permission/domain/repositories/permission_repository.dart';

import '../../../../../support/builders/frames.dart';
import '../../../../../support/fakes/fake_credentials.dart';
import '../../../../../support/fakes/fake_frame_socket.dart';
import '../../../../../support/fakes/recording_writer.dart';

/// The backend, answering what the test set — or refusing with it — and keeping what it was asked.
class _FakeApi implements PermissionApiDataSource {
  Object? answer;
  Failure? refusal;
  final List<(String, String)> asked = <(String, String)>[];

  @override
  Future<Object?> lookup(String sessionId, String requestId) async {
    asked.add((sessionId, requestId));
    final Failure? failure = refusal;
    if (failure != null) {
      throw failure;
    }
    return answer;
  }
}

ServerFailure refusedWith(String code) =>
    ServerFailure(code: code, messageKey: 'permission.error.x', traceId: 'trace-1');

void main() {
  late List<FakeFrameSocket> opened;
  late WsClient client;
  late _FakeApi api;
  late PermissionRepositoryImpl repository;

  setUp(() {
    opened = <FakeFrameSocket>[];
    api = _FakeApi();
    client = WsClient(
      url: Uri.parse('ws://localhost:3000/ws'),
      credentials: FakeCredentials(),
      logger: AppLogger(
        context: const LogContext(appVersion: '0.0.1', platform: 'android'),
        writer: RecordingWriter().writer,
      ),
      appVersion: '0.0.1',
      connect: (Uri url) {
        final FakeFrameSocket socket = FakeFrameSocket();
        opened.add(socket);
        return socket;
      },
      schedule: (void Function() body, Duration delay) => () {},
      random: Random(7),
      traceIds: TraceIds(random: Random(7)),
    );
    repository = PermissionRepositoryImpl(
      client: client,
      api: api,
      traceIds: TraceIds(random: Random(7)),
    );
  });

  tearDown(() => client.dispose());

  group('lookup', () {
    test('asks about that request of that session', () async {
      api.answer = <String, Object?>{'status': 'pending', 'request': permissionRequestedPayload()};

      await repository.lookup('ses-1', 'req-1');

      expect(api.asked, <(String, String)>[('ses-1', 'req-1')]);
    });

    test('reads a pending body as LookupPending, in the session asked about', () async {
      api.answer = <String, Object?>{
        'status': 'pending',
        'request': permissionRequestedPayload(),
        'remainingExtensions': 2,
      };

      final PermissionLookup lookup = await repository.lookup('ses-1', 'req-1');

      expect(lookup, isA<LookupPending>());
      final LookupPending pending = lookup as LookupPending;
      expect(pending.request.requestId, 'req-1');
      expect(pending.request.sessionId, 'ses-1');
      expect(pending.remainingExtensions, 2);
    });

    test('reads a resolved body as LookupSettled', () async {
      api.answer = const <String, Object?>{
        'status': 'resolved',
        'requestId': 'req-1',
        'decision': 'deny',
        'auto': false,
        'resolvedFrom': 'web',
      };

      expect(
        await repository.lookup('ses-1', 'req-1'),
        const LookupSettled(
          PermissionOutcome(
            requestId: 'req-1',
            decision: PermissionDecision.deny,
            auto: false,
            origin: AnswerOrigin.web,
          ),
        ),
      );
    });

    test('reads PERMISSION_REQUEST_EXPIRED as an answer: LookupExpired', () async {
      api.refusal = refusedWith('PERMISSION_REQUEST_EXPIRED');

      expect(await repository.lookup('ses-1', 'req-1'), const LookupExpired());
    });

    test('reads PERMISSION_REQUEST_NOT_FOUND as an answer: LookupGone', () async {
      api.refusal = refusedWith('PERMISSION_REQUEST_NOT_FOUND');

      expect(await repository.lookup('ses-1', 'req-1'), const LookupGone());
    });

    test("keeps somebody else's request a failure, the same one", () async {
      final ServerFailure notOwned = refusedWith('PERMISSION_NOT_OWNED');
      api.refusal = notOwned;

      await expectLater(repository.lookup('ses-1', 'req-1'), throwsA(same(notOwned)));
    });

    test('keeps a network failure a failure', () async {
      const NetworkFailure offline = NetworkFailure(traceId: 'trace-2');
      api.refusal = offline;

      await expectLater(repository.lookup('ses-1', 'req-1'), throwsA(same(offline)));
    });

    test('refuses to draw a card from a body it cannot read', () async {
      api.answer = <String, Object?>{
        'status': 'pending',
        'request': permissionRequestedPayload(const <String, Object?>{'toolName': null}),
      };

      await expectLater(
        repository.lookup('ses-1', 'req-1'),
        throwsA(isA<UnexpectedFailure>().having((Failure f) => f.traceId, 'traceId', isNotEmpty)),
      );
    });

    test('refuses a body that is not a map', () async {
      api.answer = 'pending';

      await expectLater(repository.lookup('ses-1', 'req-1'), throwsA(isA<UnexpectedFailure>()));
    });
  });

  group('watch', () {
    test('answers a feed over the socket, attached to that session', () async {
      client.connect();
      await Future<void>.delayed(Duration.zero);
      opened.last.deliver(connectionReady());
      await Future<void>.delayed(Duration.zero);

      final PermissionFeed feed = repository.watch('ses-1');

      expect(feed, isA<SocketPermissionFeed>());
      expect(opened.last.sent.last, contains('"type":"session.attach"'));
      expect(opened.last.sent.last, contains('"sessionId":"ses-1"'));

      feed.close();
    });
  });
}
