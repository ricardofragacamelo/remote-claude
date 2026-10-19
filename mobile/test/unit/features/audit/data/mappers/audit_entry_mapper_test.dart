/// `GET /audit-entries` — the trail, read as entries this build can draw (plan 26, B-32).
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/audit/data/mappers/audit_entry_mapper.dart';
import 'package:remote_claude/features/audit/domain/entities/audit_entry.dart';

Map<String, Object?> _entryWire({
  String id = 'e1',
  String decision = 'allowed',
  String at = '2026-09-26T12:00:00.000Z',
  Map<String, Object?>? verdict,
}) => <String, Object?>{
  'id': id,
  'sessionId': 's1',
  'toolUseId': 't1',
  'toolName': 'Bash',
  'kind': 'shell',
  'input': <String, Object?>{},
  'decision': decision,
  'at': at,
  'traceId': 'tr-1',
  'verdict': verdict,
};

Map<String, Object?> _pageWire({List<Object?>? entries, String? nextCursor}) => <String, Object?>{
  'entries': entries ?? <Object?>[_entryWire()],
  'nextCursor': nextCursor,
};

void main() {
  test('S-88 · reads a page: the entries, newest first, and the next cursor', () {
    final AuditEntryPage? page = auditEntryPageFrom(
      _pageWire(
        entries: <Object?>[
          _entryWire(id: 'e1'),
          _entryWire(id: 'e2', decision: 'denied'),
        ],
        nextCursor: '42',
      ),
    );

    expect(page, isNotNull);
    expect(page!.entries.map((AuditEntry e) => e.id), <String>['e1', 'e2']);
    expect(page.entries[1].decision, AuditDecision.denied);
    expect(page.nextCursor, '42');
  });

  test('a recorded entry (nothing to decide) has no verdict', () {
    final AuditEntryPage? page = auditEntryPageFrom(
      _pageWire(entries: <Object?>[_entryWire(decision: 'recorded', verdict: null)]),
    );

    expect(page!.entries.single.decision, AuditDecision.recorded);
    expect(page.entries.single.verdict, isNull);
  });

  test('a verdict decided automatically, by a rule, or by a named person from a named place', () {
    final AuditEntryPage? page = auditEntryPageFrom(
      _pageWire(
        entries: <Object?>[
          _entryWire(
            id: 'auto',
            verdict: <String, Object?>{
              'requestId': 'r1',
              'auto': true,
              'ruleId': null,
              'scope': 'request',
              'resolvedBy': null,
              'resolvedFrom': null,
            },
          ),
          _entryWire(
            id: 'rule',
            verdict: <String, Object?>{
              'requestId': 'r2',
              'auto': true,
              'ruleId': 'rule-1',
              'scope': 'project',
              'resolvedBy': null,
              'resolvedFrom': null,
            },
          ),
          _entryWire(
            id: 'person',
            verdict: <String, Object?>{
              'requestId': 'r3',
              'auto': false,
              'ruleId': null,
              'scope': 'request',
              'resolvedBy': 'alice',
              'resolvedFrom': 'mobile',
            },
          ),
        ],
      ),
    );

    final List<AuditEntry> entries = page!.entries;
    expect(entries[0].verdict!.auto, isTrue);
    expect(entries[0].verdict!.ruleId, isNull);
    expect(entries[1].verdict!.ruleId, 'rule-1');
    expect(entries[2].verdict!.resolvedBy, 'alice');
    expect(entries[2].verdict!.resolvedFrom, 'mobile');
  });

  group('err · a page or an entry this build cannot read', () {
    test('not a map at all', () {
      expect(auditEntryPageFrom('nope'), isNull);
      expect(auditEntryPageFrom(null), isNull);
    });

    test('missing a field the page shape requires', () {
      final Map<String, Object?> wire = _pageWire()..remove('entries');

      expect(auditEntryPageFrom(wire), isNull);
    });

    test('an entry with a decision this build does not know is dropped, not the whole page', () {
      final AuditEntryPage? page = auditEntryPageFrom(
        _pageWire(
          entries: <Object?>[
            _entryWire(id: 'keep'),
            _entryWire(id: 'drop', decision: 'pending'),
          ],
        ),
      );

      expect(page!.entries.map((AuditEntry e) => e.id), <String>['keep']);
    });

    test('an entry whose instant cannot be parsed is dropped too', () {
      final AuditEntryPage? page = auditEntryPageFrom(
        _pageWire(
          entries: <Object?>[
            _entryWire(id: 'keep'),
            _entryWire(id: 'drop', at: 'whenever'),
          ],
        ),
      );

      expect(page!.entries.map((AuditEntry e) => e.id), <String>['keep']);
    });
  });

  test('an empty page is a page with nothing, not unreadable', () {
    final AuditEntryPage? page = auditEntryPageFrom(_pageWire(entries: <Object?>[]));

    expect(page!.entries, isEmpty);
    expect(page.nextCursor, isNull);
  });
}
