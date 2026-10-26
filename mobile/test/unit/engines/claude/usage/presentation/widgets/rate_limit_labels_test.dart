import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/engines/claude/usage/domain/entities/rate_limit_window.dart';
import 'package:remote_claude/engines/claude/usage/presentation/widgets/rate_limit_labels.dart';

RateLimitWindow _window(String kind) => RateLimitWindow(
  kind: kind,
  status: RateLimitStatus.allowed,
  utilizationPercent: 0,
  resetsAt: null,
  observedAt: DateTime.utc(2026),
);

void main() {
  group('orderedByKind', () {
    test('puts the known windows first, in the order the account panel lists them', () {
      final List<RateLimitWindow> ordered = orderedByKind(<RateLimitWindow>[
        _window('overage'),
        _window('seven_day'),
        _window('model_scoped:fable'),
        _window('five_hour'),
      ]);

      expect(ordered.map((RateLimitWindow w) => w.kind), <String>[
        'five_hour',
        'seven_day',
        'overage',
        'model_scoped:fable',
      ]);
    });

    test('sorts unknown kinds after the known ones, alphabetically among themselves', () {
      final List<RateLimitWindow> ordered = orderedByKind(<RateLimitWindow>[
        _window('zzz_unknown'),
        _window('five_hour'),
        _window('aaa_unknown'),
      ]);

      expect(ordered.map((RateLimitWindow w) => w.kind), <String>[
        'five_hour',
        'aaa_unknown',
        'zzz_unknown',
      ]);
    });
  });
}
