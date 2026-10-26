import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/engines/claude/usage/data/mappers/rate_limit_mapper.dart';
import 'package:remote_claude/engines/claude/usage/domain/entities/rate_limit_window.dart';

const Map<String, Object?> window = <String, Object?>{
  'kind': 'five_hour',
  'status': 'allowedWarning',
  'utilizationPercent': 83,
  'resetsAt': '2026-10-29T00:00:00.000Z',
  'observedAt': '2026-10-26T12:00:00.000Z',
};

void main() {
  group('rateLimitWindowFrom', () {
    test('reads the window the backend answered', () {
      final RateLimitWindow? read = rateLimitWindowFrom(window);

      expect(read, isNotNull);
      expect(read!.kind, 'five_hour');
      expect(read.status, RateLimitStatus.allowedWarning);
      expect(read.utilizationPercent, 83);
      expect(read.resetsAt, DateTime.parse('2026-10-29T00:00:00.000Z'));
      expect(read.observedAt, DateTime.parse('2026-10-26T12:00:00.000Z'));
      expect(read.displayName, isNull);
    });

    test('reads the server\'s own label of a per-model window', () {
      final RateLimitWindow? read = rateLimitWindowFrom(<String, Object?>{
        ...window,
        'kind': 'model_scoped:fable',
        'displayName': 'Fable',
      });

      expect(read!.displayName, 'Fable');
    });

    // An app already on a store has to survive a status added after it shipped.
    test('reads a status it does not know as allowed, the least alarming reading', () {
      final RateLimitWindow? read = rateLimitWindowFrom(<String, Object?>{
        ...window,
        'status': 'made_up',
      });

      expect(read!.status, RateLimitStatus.allowed);
    });

    test('reads no utilization and no reset as null, never as zero', () {
      final RateLimitWindow? read = rateLimitWindowFrom(<String, Object?>{
        ...window,
        'utilizationPercent': null,
        'resetsAt': null,
      });

      expect(read!.utilizationPercent, isNull);
      expect(read.resetsAt, isNull);
    });

    test('answers null for something that is not a window', () {
      expect(rateLimitWindowFrom(null), isNull);
      expect(rateLimitWindowFrom('a string'), isNull);
      expect(rateLimitWindowFrom(<String, Object?>{}), isNull);
    });

    test('answers null for a window whose observedAt does not parse — nothing to show it with', () {
      expect(rateLimitWindowFrom(<String, Object?>{...window, 'observedAt': 'not a date'}), isNull);
    });
  });

  group('rateLimitWindowsFrom', () {
    test('reads every window of the body', () {
      final List<RateLimitWindow> windows = rateLimitWindowsFrom(<String, Object?>{
        'windows': <Object?>[
          window,
          <String, Object?>{...window, 'kind': 'seven_day'},
        ],
      });

      expect(windows, hasLength(2));
      expect(windows.map((RateLimitWindow w) => w.kind), <String>['five_hour', 'seven_day']);
    });

    test('drops a window it cannot read, keeping the rest', () {
      final List<RateLimitWindow> windows = rateLimitWindowsFrom(<String, Object?>{
        'windows': <Object?>[window, 'not a window', null],
      });

      expect(windows, hasLength(1));
    });

    test('answers an empty list for a body with no windows at all', () {
      expect(rateLimitWindowsFrom(null), isEmpty);
      expect(rateLimitWindowsFrom(<String, Object?>{}), isEmpty);
      expect(rateLimitWindowsFrom(<String, Object?>{'windows': 'not a list'}), isEmpty);
    });
  });
}
