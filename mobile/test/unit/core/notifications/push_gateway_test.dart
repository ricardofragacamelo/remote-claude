/// The values the notification side is made of.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/notifications/push_gateway.dart';

void main() {
  test('an arrival compares by value, so a redelivery is not a second notification', () {
    final DateTime expires = DateTime.utc(2026, 9, 20, 12);

    expect(
      PushArrival(sessionId: 's', requestId: 'r', expiresAt: expires, isWithdrawal: false),
      PushArrival(sessionId: 's', requestId: 'r', expiresAt: expires, isWithdrawal: false),
    );

    expect(
      PushArrival(sessionId: 's', requestId: 'r', expiresAt: expires, isWithdrawal: false),
      isNot(PushArrival(sessionId: 's', requestId: 'r', expiresAt: expires, isWithdrawal: true)),
    );
  });

  test('the permission a build with no transport reports is its own state', () {
    // Never folded into `denied`: a person who refused can change their mind in the system
    // settings, and a build with no transport gives them nothing to change (D-21).
    expect(PushPermission.values, contains(PushPermission.unavailable));
    expect(PushPermission.unavailable, isNot(PushPermission.denied));
  });
}
