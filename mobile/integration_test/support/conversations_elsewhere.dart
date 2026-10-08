/// The door the scripted backend opens into Claude's store, for a conversation **begun elsewhere**
/// — the editor of the person, writing it now — and growing while it is read (plan 22, B-34, D-17).
///
/// The same door the Playwright suite knocks on (`e2e/fixtures/history.ts`), reached the way the app
/// reaches everything: through the web server of the stack, which forwards `/api` to the backend
/// without the prefix (plan 10, D-13) — the backend's own port is not reversed into the device. It
/// is mounted on the scripted entry point only, and asks for no token. Nothing here is the app's own
/// code: what lands in the store is what the SDK read back of real runs, written now.
library;

import 'package:dio/dio.dart';
import 'package:remote_claude/core/config/app_config.dart';

import 'e2e_environment.dart';

/// Where the door is, under the API of the backend.
const String _door = '/e2e/conversations-elsewhere';

/// Entries of a recording's `history` — from [from] up to, not including, [to].
typedef RecordedEntries = ({String fixture, int? from, int? to});

/// The other client, writing a conversation of its own in Claude's store.
class ConversationsElsewhere {
  ConversationsElsewhere(BuildConfig build)
    : _dio = Dio(BaseOptions(baseUrl: '${talkingThrough(build).apiBaseUrl}$_door'));

  final Dio _dio;

  /// Plants the conversation [conversationId] in [cwd], titled [title], out of what the SDK read
  /// back of the recording [fixture] — its prompts and the instant of every entry.
  Future<void> plant({
    required String conversationId,
    required String cwd,
    required String fixture,
    required String title,
  }) => _expect(
    _dio.post<Object?>(
      '',
      data: <String, Object?>{
        'conversationId': conversationId,
        'cwd': cwd,
        'fixture': fixture,
        'title': title,
        'history': true,
      },
      options: _answered,
    ),
    201,
  );

  /// The other client writes: [entries] land at the end of [conversationId], written now.
  Future<void> append(String conversationId, RecordedEntries entries) => _expect(
    _dio.post<Object?>(
      '/${Uri.encodeComponent(conversationId)}/entries',
      data: <String, Object?>{
        'fixture': entries.fixture,
        if (entries.from != null) 'from': entries.from,
        if (entries.to != null) 'to': entries.to,
      },
      options: _answered,
    ),
    204,
  );

  /// The other client compacts: the chain of [conversationId] becomes what the recording [fixture]
  /// said after its `compact_boundary`.
  Future<void> compact(String conversationId, String fixture) => _expect(
    _dio.put<Object?>(
      '/${Uri.encodeComponent(conversationId)}/chain',
      data: <String, Object?>{'fixture': fixture},
      options: _answered,
    ),
    204,
  );

  /// A refusal is an answer here — said with the body that explains it, not thrown without it.
  static final Options _answered = Options(validateStatus: (_) => true);

  static Future<void> _expect(Future<Response<Object?>> sent, int status) async {
    final Response<Object?> response = await sent;

    if (response.statusCode != status) {
      throw StateError(
        'the door answered ${response.statusCode} (expected $status): ${response.data}',
      );
    }
  }
}
