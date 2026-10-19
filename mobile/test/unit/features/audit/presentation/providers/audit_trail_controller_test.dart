/// The trail of one session's calls of one kind, one page at a time (plan 26, B-32).
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/error/failure.dart';
import 'package:remote_claude/features/audit/audit_providers.dart';
import 'package:remote_claude/features/audit/domain/entities/audit_entry.dart';
import 'package:remote_claude/features/audit/domain/repositories/audit_repository.dart';
import 'package:remote_claude/features/audit/presentation/providers/audit_trail_controller.dart';

import '../../../../../support/fakes/fake_audit_repository.dart';

AuditEntry _entry(String id) =>
    AuditEntry(id: id, at: DateTime.utc(2026, 9, 26), decision: AuditDecision.recorded);

void main() {
  late FakeAuditRepository repo;

  ProviderContainer build() {
    repo = FakeAuditRepository();
    final ProviderContainer container = ProviderContainer(
      overrides: <Override>[auditRepositoryProvider.overrideWithValue(repo as AuditRepository)],
    );
    addTearDown(container.dispose);
    return container;
  }

  test('S-88 · reads the first page of the session and the kind asked about', () async {
    final ProviderContainer container = build();
    repo.pages[null] = AuditEntryPage(entries: <AuditEntry>[_entry('e1')], nextCursor: 'c1');

    final AuditTrailBoard board = await container.read(
      auditTrailControllerProvider('s1', 'shell').future,
    );

    expect(board.entries.map((AuditEntry e) => e.id), <String>['e1']);
    expect(board.hasMore, isTrue);
    expect(repo.reads, <(String, String, String?)>[('s1', 'shell', null)]);
  });

  test('S-90 · an empty trail is a board with nothing, and no next page', () async {
    final ProviderContainer container = build();
    repo.pages[null] = const AuditEntryPage(entries: <AuditEntry>[]);

    final AuditTrailBoard board = await container.read(
      auditTrailControllerProvider('s1', 'shell').future,
    );

    expect(board.entries, isEmpty);
    expect(board.hasMore, isFalse);
  });

  test('loading the next page appends it, after the one already on screen', () async {
    final ProviderContainer container = build();
    repo.pages[null] = AuditEntryPage(entries: <AuditEntry>[_entry('e1')], nextCursor: 'c1');
    repo.pages['c1'] = AuditEntryPage(entries: <AuditEntry>[_entry('e2')], nextCursor: null);
    await container.read(auditTrailControllerProvider('s1', 'shell').future);

    await container.read(auditTrailControllerProvider('s1', 'shell').notifier).loadMore();

    final AuditTrailBoard board = container
        .read(auditTrailControllerProvider('s1', 'shell'))
        .value!;
    expect(board.entries.map((AuditEntry e) => e.id), <String>['e1', 'e2']);
    expect(board.hasMore, isFalse);
  });

  test('asking for one more page while there is none does nothing', () async {
    final ProviderContainer container = build();
    repo.pages[null] = AuditEntryPage(entries: <AuditEntry>[_entry('e1')]);
    await container.read(auditTrailControllerProvider('s1', 'shell').future);

    await container.read(auditTrailControllerProvider('s1', 'shell').notifier).loadMore();

    expect(repo.reads, hasLength(1));
  });

  test('a later page that fails keeps what is on screen, with the reason beside it', () async {
    final ProviderContainer container = build();
    repo.pages[null] = AuditEntryPage(entries: <AuditEntry>[_entry('e1')], nextCursor: 'c1');
    await container.read(auditTrailControllerProvider('s1', 'shell').future);

    repo.failure = const NetworkFailure(traceId: 't');
    await container.read(auditTrailControllerProvider('s1', 'shell').notifier).loadMore();

    final AuditTrailBoard board = container
        .read(auditTrailControllerProvider('s1', 'shell'))
        .value!;
    expect(board.entries.map((AuditEntry e) => e.id), <String>['e1']);
    expect(board.moreFailure, isA<NetworkFailure>());
    expect(board.loadingMore, isFalse);
    // A failed page is not the last one: the cursor it was asked with stays, so a second try
    // offers the same next page rather than quietly stopping the list short.
    expect(board.nextCursor, 'c1');
    expect(board.hasMore, isTrue);
  });

  test('retry reads the trail again, from the start', () async {
    final ProviderContainer container = build();
    repo.pages[null] = AuditEntryPage(entries: <AuditEntry>[_entry('e1')]);
    await container.read(auditTrailControllerProvider('s1', 'shell').future);

    container.read(auditTrailControllerProvider('s1', 'shell').notifier).retry();
    await container.read(auditTrailControllerProvider('s1', 'shell').future);

    expect(repo.reads, hasLength(2));
  });
}
