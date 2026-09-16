import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/network/trace.dart';

void main() {
  test('answers a version 4 UUID', () {
    final String trace = TraceIds().next();

    expect(
      trace,
      matches(RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')),
    );
  });

  test('answers a different trace every time', () {
    final TraceIds traces = TraceIds();

    expect(<String>{for (int i = 0; i < 50; i++) traces.next()}, hasLength(50));
  });

  test('is deterministic when the randomness is', () {
    expect(TraceIds(random: Random(1)).next(), TraceIds(random: Random(1)).next());
  });
}
