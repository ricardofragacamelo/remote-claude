/// The trail of one session's calls of one kind, one page at a time (plan 26, B-32).
library;

import 'package:equatable/equatable.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/audit/audit_providers.dart';
import 'package:remote_claude/features/audit/domain/entities/audit_entry.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

part 'audit_trail_controller.g.dart';

/// What [AuditTrailBoard.copyWith] leaves as it was.
const Object _same = Object();

/// The entries read so far, and what reading one more page is doing.
class AuditTrailBoard extends Equatable {
  const AuditTrailBoard({
    required this.entries,
    this.nextCursor,
    this.loadingMore = false,
    this.moreFailure,
  });

  /// Every entry read so far, newest first.
  final List<AuditEntry> entries;

  /// The next page's cursor, or `null` when this was the last one.
  final String? nextCursor;

  /// Whether there is a next page at all.
  bool get hasMore => nextCursor != null;

  /// An earlier page is being read. A second ask does nothing.
  final bool loadingMore;

  /// Why reading one more page failed. What is on screen stays, with "try again" beside it.
  final Failure? moreFailure;

  /// This board with what is given changed. [nextCursor] and [moreFailure] are nullable by design
  /// — a page can be the last one, and a failure can be cleared — so each takes the sentinel to
  /// tell "not given" apart from "given as `null`" (the same reasoning as `HistoryBoard`'s own).
  AuditTrailBoard copyWith({
    List<AuditEntry>? entries,
    Object? nextCursor = _same,
    bool? loadingMore,
    Object? moreFailure = _same,
  }) => AuditTrailBoard(
    entries: entries ?? this.entries,
    nextCursor: identical(nextCursor, _same) ? this.nextCursor : nextCursor as String?,
    loadingMore: loadingMore ?? this.loadingMore,
    moreFailure: identical(moreFailure, _same) ? this.moreFailure : moreFailure as Failure?,
  );

  @override
  List<Object?> get props => <Object?>[entries, nextCursor, loadingMore, moreFailure];
}

/// The trail of [kind]'s calls in [sessionId].
@riverpod
class AuditTrailController extends _$AuditTrailController {
  @override
  Future<AuditTrailBoard> build(String sessionId, String kind) async {
    final AuditEntryPage page = await ref.watch(readAuditTrailProvider)(
      sessionId: sessionId,
      kind: kind,
    );

    return AuditTrailBoard(entries: page.entries, nextCursor: page.nextCursor);
  }

  /// Reads the trail again, from the start — the recovery the error state offers.
  void retry() => ref.invalidateSelf();

  /// Reads the page after the last one on screen, and appends it.
  Future<void> loadMore() async {
    final AuditTrailBoard? board = state.value;
    final String? cursor = board?.nextCursor;

    if (board == null || cursor == null || board.loadingMore) {
      return;
    }

    state = AsyncValue<AuditTrailBoard>.data(board.copyWith(loadingMore: true, moreFailure: null));

    try {
      final AuditEntryPage page = await ref.read(readAuditTrailProvider)(
        sessionId: sessionId,
        kind: kind,
        cursor: cursor,
      );
      final AuditTrailBoard? now = state.value;

      if (now != null) {
        state = AsyncValue<AuditTrailBoard>.data(
          now.copyWith(
            entries: <AuditEntry>[...now.entries, ...page.entries],
            nextCursor: page.nextCursor,
            loadingMore: false,
          ),
        );
      }
    } on Object catch (error) {
      final AuditTrailBoard? now = state.value;

      if (now != null) {
        state = AsyncValue<AuditTrailBoard>.data(
          now.copyWith(loadingMore: false, moreFailure: asFailure(error)),
        );
      }
    }
  }
}
