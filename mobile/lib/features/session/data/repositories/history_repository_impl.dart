/// The history repository: the wire, parsed off the UI thread into the entities the screen uses.
library;

import 'package:flutter/foundation.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/session/data/datasources/history_api_data_source.dart';
import 'package:remote_claude/features/session/data/mappers/history_mapper.dart';
import 'package:remote_claude/features/session/domain/entities/history_page.dart';
import 'package:remote_claude/features/session/domain/repositories/history_repository.dart';

/// How a body becomes a page. Injected so a test can see that it happens, and where.
typedef HistoryParser = Future<HistoryPage?> Function(Object? body);

/// Parses in another isolate.
///
/// A page is 25 messages, and a message of a real conversation measured 16.5 KB on average —
/// input and output of tools included (04 · D-02). Walking that on the UI thread is a dropped
/// frame on every page, which is exactly what `compute()` exists for.
Future<HistoryPage?> parseInBackground(Object? body) => compute(historyPageFrom, body);

/// [HistoryRepository] over the backend's HTTP API.
class HistoryRepositoryImpl implements HistoryRepository {
  const HistoryRepositoryImpl(this._api, {this._parse = parseInBackground});

  final HistoryApiDataSource _api;
  final HistoryParser _parse;

  @override
  Future<HistoryPage> page(String conversationId, {String? cursor}) async {
    final HistoryPage? page = await _parse(await _api.messages(conversationId, cursor: cursor));

    // An answer that does not say which conversation it is a page of is not one this build can
    // show — and the screen still owes the person a sentence, so it becomes a failure.
    if (page == null) {
      throw const UnexpectedFailure(traceId: unknownTraceId);
    }

    return page;
  }
}
