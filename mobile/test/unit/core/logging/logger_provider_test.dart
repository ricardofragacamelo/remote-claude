import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/core/logging/logger_provider.dart';

void main() {
  test('B-11 · the build decides the level the diagnostics screen falls back to', () {
    final ProviderContainer container = ProviderContainer();
    addTearDown(container.dispose);

    expect(container.read(releaseBuildProvider), kReleaseMode);
  });

  test('the logger has to be supplied by the boot, never invented', () {
    final ProviderContainer container = ProviderContainer();
    addTearDown(container.dispose);

    expect(() => container.read(appLoggerProvider), throwsA(isA<Object>()));
  });
}
