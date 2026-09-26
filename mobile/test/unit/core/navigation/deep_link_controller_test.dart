/// Where something outside the widget tree asks the app to go.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/navigation/deep_link_controller.dart';
import 'package:remote_claude/core/navigation/routes.dart';

void main() {
  test('starts with nothing pending', () {
    final ProviderContainer container = ProviderContainer();
    addTearDown(container.dispose);

    expect(container.read(deepLinkControllerProvider), isNull);
  });

  test('holds the location that was asked for, and forgets it once honoured', () {
    final ProviderContainer container = ProviderContainer();
    addTearDown(container.dispose);

    container
        .read(deepLinkControllerProvider.notifier)
        .request(permissionRouteFor('session-1', 'request-1'));

    expect(container.read(deepLinkControllerProvider), '/sessions/session-1/permissions/request-1');

    container.read(deepLinkControllerProvider.notifier).acknowledge();

    // Without this, every rebuild would navigate again, and the screen would keep dragging
    // itself back to the notification's target.
    expect(container.read(deepLinkControllerProvider), isNull);
  });

  test('the addresses are built, never spelled twice', () {
    expect(sessionRouteFor('abc'), '/sessions/abc');
    expect(permissionRouteFor('abc', 'r1'), '/sessions/abc/permissions/r1');
  });
}
