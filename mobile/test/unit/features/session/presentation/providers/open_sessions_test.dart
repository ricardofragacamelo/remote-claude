/// The sessions open in the app, by folder — plan 10, B-44.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/session/presentation/providers/open_sessions.dart';

void main() {
  late ProviderContainer container;

  setUp(() {
    container = ProviderContainer();
    addTearDown(container.dispose);
  });

  OpenSessions open() => container.read(openSessionsProvider.notifier);

  test('S-163 · each session goes under its folder, in the order it entered', () {
    open()
      ..open('/w/a', 's-1')
      ..open('/w/b', 's-2')
      ..open('/w/a', 's-3');

    expect(open().of('/w/a'), <String>['s-1', 's-3']);
    expect(open().of('/w/b'), <String>['s-2']);
    expect(open().of('/w/none'), isEmpty);
    expect(open().folderOf('s-3'), '/w/a');
    expect(open().folderOf('s-9'), isNull);
  });

  test('S-164 · opening the same session twice opens it once, under its first folder', () {
    open()
      ..open('/w/a', 's-1')
      ..open('/w/a', 's-1')
      ..open('/w/b', 's-1');

    expect(container.read(openSessionsProvider), <String, List<String>>{
      '/w/a': <String>['s-1'],
    });
  });

  test(
    'closing in the app takes it off the list and keeps the others; a folder left empty goes',
    () {
      open()
        ..open('/w/a', 's-1')
        ..open('/w/a', 's-2')
        ..open('/w/b', 's-3')
        ..close('s-1')
        ..close('s-3');

      expect(container.read(openSessionsProvider), <String, List<String>>{
        '/w/a': <String>['s-2'],
      });
      expect(open().contains('s-1'), isFalse);
      expect(isOpen(container.read(openSessionsProvider), 's-2'), isTrue);
    },
  );

  test('closing what is not open changes nothing', () {
    open()
      ..open('/w/a', 's-1')
      ..close('s-9');

    expect(open().of('/w/a'), <String>['s-1']);
  });
}
