import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/logging/log_operations.dart';

void main() {
  group('pushTokenTail', () {
    // S-14: a push token is a credential for reaching somebody's phone. Six characters tell two
    // registrations apart in a log; they send nothing.
    test('answers the last six characters, never the whole token', () {
      const String token = 'AAAAAAAAAAAAAAAAAAAAabcdef';

      expect(pushTokenTail(token), 'abcdef');
      expect(pushTokenTail(token), isNot(contains('AAAA')));
    });

    test('answers null when there is no token at all', () {
      expect(pushTokenTail(null), isNull);
      expect(pushTokenTail(''), isNull);
    });

    test('answers a short token whole, because there is nothing to hide in it', () {
      expect(pushTokenTail('abc'), 'abc');
      expect(pushTokenTail('abcdef'), 'abcdef');
    });

    test('never answers more than six characters', () {
      expect(pushTokenTail('x' * 400), hasLength(pushTokenTailLength));
    });
  });
}
