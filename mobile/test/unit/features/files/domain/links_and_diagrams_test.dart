import 'dart:async';

import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:remote_claude/features/files/data/engines/webview_diagram_engine.dart';
import 'package:remote_claude/features/files/domain/ports/diagram_engine.dart';
import 'package:remote_claude/features/files/domain/services/diagram_queue.dart';
import 'package:remote_claude/features/files/domain/services/resolve_relative_link.dart';

import '../../../../support/fakes/fake_diagram_engine.dart';

DiagramRequest aRequest(
  String code, {
  DiagramTheme theme = DiagramTheme.light,
  double width = 320,
}) => DiagramRequest(code: code, theme: theme, width: width, density: 2);

void main() {
  group('S-86 · a relative link, against the folder of the file it is in', () {
    for (final (String href, String path, String? anchor) in <(String, String, String?)>[
      ('../plans/x.md', 'docs/plans/x.md', null),
      ('./a%20b.md', 'docs/guide/a b.md', null),
      ('x.md#secao', 'docs/guide/x.md', 'secao'),
      ('img/../y.md', 'docs/guide/y.md', null),
      ('/README.md', 'README.md', null),
      ('z.md?raw=1', 'docs/guide/z.md', null),
      ('100%zz.md', 'docs/guide/100%zz.md', null),
    ]) {
      test('$href → $path', () {
        final LinkTarget target = resolveLink('docs/guide/index.md', href);

        expect(target, isA<FileLink>());
        expect((target as FileLink).path, path);
        expect(target.anchor, anchor);
      });
    }

    test('an anchor alone stays in the same file', () {
      final FileLink link = resolveLink('docs/a.md', '#top') as FileLink;
      expect(link.path, 'docs/a.md');
      expect(link.anchor, 'top');
    });
  });

  test('S-87 · a link that climbs out of the folder is refused, without asking the server', () {
    expect(
      (resolveLink('docs/a.md', '../../../etc/passwd') as Refused).reason,
      RefusedLink.outsideFolder,
    );
    expect((resolveLink('a.md', '../x.md') as Refused).reason, RefusedLink.outsideFolder);
  });

  test('an empty link, and one that resolves to the folder itself, open nothing', () {
    expect((resolveLink('a.md', '  ') as Refused).reason, RefusedLink.empty);
    expect((resolveLink('docs/a.md', '..') as Refused).reason, RefusedLink.empty);
  });

  test('S-89 · http, https and mailto leave the app', () {
    for (final String href in <String>[
      'http://example.com',
      'HTTPS://example.com/a?b',
      'mailto:a@b.c',
      '//cdn.example.com/x',
    ]) {
      final LinkTarget target = resolveLink('a.md', href);
      expect(target, href.startsWith('//') ? isA<Refused>() : isA<OutsideLink>(), reason: href);
    }
  });

  test('S-90 · javascript:, file:, data:, intent: and an unknown scheme do not open', () {
    for (final String href in <String>[
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'file:///etc/passwd',
      'data:text/html,<script>',
      'intent://scan/#Intent;end',
      'weird+scheme:thing',
    ]) {
      expect(resolveLink('a.md', href), isA<Refused>(), reason: href);
      expect((resolveLink('a.md', href) as Refused).reason, RefusedLink.scheme);
    }
  });

  group('the queue of the diagrams — B-21', () {
    test('S-94 · the image of a valid code, in the theme and the width asked', () async {
      final FakeDiagramEngine engine = FakeDiagramEngine();
      final DiagramResult result = await DiagramQueue(
        engine,
      ).draw(aRequest('flowchart TD; A-->B', theme: DiagramTheme.dark, width: 400));

      expect(result, isA<DiagramDrawn>());
      expect(engine.asked.single.theme, DiagramTheme.dark);
      expect(engine.asked.single.width, 400);
    });

    test('S-95 · invalid code is a failure with its line, and it is kept', () async {
      final FakeDiagramEngine engine = FakeDiagramEngine()
        ..answers['bad'] = const DiagramInvalid(line: 3);
      final DiagramQueue queue = DiagramQueue(engine);

      expect(((await queue.draw(aRequest('bad'))) as DiagramInvalid).line, 3);
      await queue.draw(aRequest('bad'));
      expect(engine.asked, hasLength(1));
    });

    test('S-96 · code past 50 000 characters never reaches the engine', () async {
      final FakeDiagramEngine engine = FakeDiagramEngine();
      final DiagramResult result = await DiagramQueue(
        engine,
      ).draw(aRequest('x' * (maxDiagramSource + 1)));

      expect(result, isA<DiagramTooLarge>());
      expect((result as DiagramTooLarge).size, maxDiagramSource + 1);
      expect(result.limit, maxDiagramSource);
      expect(engine.asked, isEmpty);
      expect(
        await DiagramQueue(engine).draw(aRequest('x' * maxDiagramSource)),
        isA<DiagramDrawn>(),
      );
    });

    test(
      'S-97 · an engine past the deadline is a timeout, the queue goes on, and nothing is kept',
      () {
        fakeAsync((FakeAsync async) {
          final FakeDiagramEngine engine = FakeDiagramEngine()..gate = Completer<void>();
          final DiagramQueue queue = DiagramQueue(engine);
          DiagramResult? first;
          DiagramResult? second;

          unawaited(queue.draw(aRequest('slow')).then((DiagramResult r) => first = r));
          unawaited(queue.draw(aRequest('next')).then((DiagramResult r) => second = r));
          async.elapse(diagramDeadline + const Duration(milliseconds: 1));
          expect(first, isA<DiagramTimedOut>());

          engine.gate!.complete();
          async.flushMicrotasks();
          expect(second, isA<DiagramDrawn>());

          engine.gate = null;
          unawaited(queue.draw(aRequest('slow')));
          async.flushMicrotasks();
          expect(engine.asked.where((DiagramRequest r) => r.code == 'slow'), hasLength(2));
        });
      },
    );

    test('S-98 · thirty asked at once are drawn one at a time', () async {
      final FakeDiagramEngine engine = FakeDiagramEngine();
      final DiagramQueue queue = DiagramQueue(engine);

      await Future.wait(<Future<DiagramResult>>[
        for (int index = 0; index < 30; index++) queue.draw(aRequest('graph $index')),
      ]);

      expect(engine.asked, hasLength(30));
      expect(engine.mostAtOnce, 1);
      expect(queue.drawn, 30);
    });

    test(
      'S-99 · the same code, theme and width is not drawn again; another theme or width is',
      () async {
        final FakeDiagramEngine engine = FakeDiagramEngine();
        final DiagramQueue queue = DiagramQueue(engine);

        await queue.draw(aRequest('a'));
        await queue.draw(aRequest('a'));
        await Future.wait(<Future<DiagramResult>>[
          queue.draw(aRequest('b')),
          queue.draw(aRequest('b')),
        ]);
        await queue.draw(aRequest('a', theme: DiagramTheme.dark));
        await queue.draw(aRequest('a', width: 640));

        expect(engine.asked.map((DiagramRequest r) => r.code), <String>['a', 'b', 'a', 'a']);
      },
    );
  });

  test('the page of the engine answers an image, or a refusal with or without the line', () {
    expect(resultOf(<String, Object?>{'id': 1, 'png': 'iVBORw0K'}), isA<DiagramDrawn>());
    expect(
      (resultOf(<String, Object?>{'id': 1, 'invalid': true, 'line': 4}) as DiagramInvalid).line,
      4,
    );
    expect((resultOf(<String, Object?>{'id': 1, 'invalid': true}) as DiagramInvalid).line, isNull);
  });
}
