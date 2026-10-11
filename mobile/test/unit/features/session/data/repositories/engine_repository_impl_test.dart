/// The engines of the installation, from the wire to the entities (plan 28, B-13).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/data/datasources/engine_api_data_source.dart';
import 'package:remote_claude/features/session/data/repositories/engine_repository_impl.dart';
import 'package:remote_claude/features/session/domain/entities/engine.dart';
import 'package:remote_claude/features/session/domain/usecases/list_engines.dart';

import '../../../../../support/builders/conversations.dart';

/// Answers a fixed body, or throws what it is told to, and counts how often it was asked.
class _Api implements EngineApiDataSource {
  _Api(this.body, {this.failure});

  final Object? body;
  final Object? failure;
  int asked = 0;

  @override
  Future<Object?> engines() async {
    asked += 1;
    final Object? thrown = failure;
    if (thrown != null) {
      throw thrown;
    }
    return body;
  }
}

void main() {
  test('reads the catalogue the backend answers', () async {
    final _Api api = _Api(<String, Object?>{
      'defaultEngine': anEngine,
      'engines': <Object?>[engineJson()],
    });

    final EngineCatalogue catalogue = await EngineRepositoryImpl(api).list();

    expect(api.asked, 1);
    expect(catalogue.defaultEngine, anEngine);
    expect(catalogue.displayNameOf(anEngine), anEngineName);
    expect(catalogue.engineOf(anEngine)!.capabilities, someCapabilities);
  });

  test('an answer that is not a catalogue is a failure the screen can say', () async {
    await expectLater(
      EngineRepositoryImpl(_Api('engines')).list(),
      throwsA(isA<UnexpectedFailure>()),
    );
  });

  test('a failure of the source goes up as it is', () async {
    await expectLater(
      EngineRepositoryImpl(_Api(null, failure: const NetworkFailure(traceId: 't'))).list(),
      throwsA(isA<NetworkFailure>()),
    );
  });

  test('the use case asks the repository, once per call', () async {
    final _Api api = _Api(<String, Object?>{'defaultEngine': anEngine, 'engines': <Object?>[]});

    final EngineCatalogue catalogue = await ListEngines(EngineRepositoryImpl(api))();

    expect(catalogue, const EngineCatalogue(defaultEngine: anEngine));
    expect(api.asked, 1);
  });
}
