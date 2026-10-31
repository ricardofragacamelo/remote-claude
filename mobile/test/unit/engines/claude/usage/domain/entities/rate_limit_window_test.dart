/// `RateLimitWindow`'s own value equality — plan 16, D-09.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/engines/claude/usage/domain/entities/rate_limit_window.dart';

RateLimitWindow _window({
  String kind = 'five_hour',
  RateLimitStatus status = RateLimitStatus.allowed,
  int? utilizationPercent = 8,
  DateTime? resetsAt,
  String? displayName,
}) => RateLimitWindow(
  kind: kind,
  status: status,
  utilizationPercent: utilizationPercent,
  resetsAt: resetsAt,
  observedAt: DateTime.utc(2026, 10, 26, 12),
  displayName: displayName,
);

void main() {
  test('two windows with every field the same are equal', () {
    expect(
      _window(resetsAt: DateTime.utc(2026, 11, 2)),
      _window(resetsAt: DateTime.utc(2026, 11, 2)),
    );
  });

  test('a window differs from another by any one field', () {
    final RateLimitWindow base = _window();

    expect(base, isNot(_window(kind: 'seven_day')));
    expect(base, isNot(_window(status: RateLimitStatus.rejected)));
    expect(base, isNot(_window(utilizationPercent: 9)));
    expect(base, isNot(_window(utilizationPercent: null)));
    expect(base, isNot(_window(resetsAt: DateTime.utc(2026, 11, 2))));
    expect(base, isNot(_window(displayName: 'Fable')));
  });
}
