/// The content repository: the routes, read into entities — plan 22, B-32, B-33.
library;

import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/core/network/api_client.dart';
import 'package:remote_claude/features/session/data/datasources/transcript_content_api_data_source.dart';
import 'package:remote_claude/features/session/data/repositories/transcript_content_repository_impl.dart';
import 'package:remote_claude/features/session/domain/entities/transcript_content.dart';

class _Source implements TranscriptContentApiDataSource {
  final List<String> asked = <String>[];
  Object? failure;

  @override
  Future<Object?> toolResult(String conversationId, String toolUseId) async {
    asked.add('$conversationId/$toolUseId');
    final Object? thrown = failure;
    if (thrown != null) {
      throw thrown;
    }
    return <String, Object?>{'text': 'out', 'truncated': true, 'bytes': 300000, 'cutAt': 1};
  }

  @override
  Future<ByteAnswer> promptImage(String conversationId, String blockId) async {
    asked.add('$conversationId/$blockId');
    return (bytes: Uint8List.fromList(<int>[1, 2]), contentType: 'image/webp');
  }
}

void main() {
  test('reads the whole output of a tool into what the card shows', () async {
    final _Source source = _Source();

    expect(
      await TranscriptContentRepositoryImpl(source).toolResult('c-1', 't1'),
      const ToolOutput(text: 'out', truncated: true, bytes: 300000, cutAt: 1),
    );
    expect(source.asked, <String>['c-1/t1']);
  });

  test('reads the image of a prompt: its bytes and their type', () async {
    final _Source source = _Source();

    final PromptImageBytes image = await TranscriptContentRepositoryImpl(
      source,
    ).promptImage('c-1', 'u1:1');

    expect(image.bytes, <int>[1, 2]);
    expect(image.mediaType, 'image/webp');
    expect(source.asked, <String>['c-1/u1:1']);
  });

  test('a failure of the source goes up as it is', () async {
    final _Source source = _Source()..failure = const NetworkFailure(traceId: 't');

    await expectLater(
      TranscriptContentRepositoryImpl(source).toolResult('c-1', 't1'),
      throwsA(isA<NetworkFailure>()),
    );
  });
}
