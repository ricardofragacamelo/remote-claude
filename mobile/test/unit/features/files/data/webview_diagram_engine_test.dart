import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:plugin_platform_interface/plugin_platform_interface.dart';
import 'package:remote_claude/features/files/data/engines/webview_diagram_engine.dart';
import 'package:remote_claude/features/files/domain/ports/diagram_engine.dart';
import 'package:webview_flutter_platform_interface/webview_flutter_platform_interface.dart';

/// The page of the app, played by the test: it says it is ready when the asset loads, and answers
/// `draw(...)` as [answer] says — or never.
class _Page extends PlatformWebViewController {
  _Page(super.params) : super.implementation();

  final List<String> scripts = <String>[];
  String? asset;
  JavaScriptMode? mode;
  final Map<String, void Function(JavaScriptMessage)> channels =
      <String, void Function(JavaScriptMessage)>{};
  PlatformNavigationDelegate? navigation;

  /// What the page posts for one drawing — `null` posts nothing.
  Map<String, Object?>? Function(int id)? answer;

  /// Whether the page says Mermaid loaded.
  bool mermaidLoaded = true;

  void post(Map<String, Object?> message) =>
      channels['Diagram']!(JavaScriptMessage(message: jsonEncode(message)));

  @override
  Future<void> setJavaScriptMode(JavaScriptMode javaScriptMode) async => mode = javaScriptMode;

  @override
  Future<void> setPlatformNavigationDelegate(PlatformNavigationDelegate handler) async =>
      navigation = handler;

  @override
  Future<void> addJavaScriptChannel(JavaScriptChannelParams javaScriptChannelParams) async =>
      channels[javaScriptChannelParams.name] = javaScriptChannelParams.onMessageReceived;

  @override
  Future<void> loadFlutterAsset(String key) async {
    asset = key;
    scheduleMicrotask(() => post(<String, Object?>{'ready': mermaidLoaded}));
  }

  @override
  Future<void> runJavaScript(String javaScript) async {
    scripts.add(javaScript);
    final int id = int.parse(RegExp(r'^draw\((\d+),').firstMatch(javaScript)!.group(1)!);
    final Map<String, Object?>? reply = answer?.call(id);
    if (reply != null) {
      scheduleMicrotask(() => post(<String, Object?>{'id': id, ...reply}));
    }
  }
}

class _Navigation extends PlatformNavigationDelegate {
  _Navigation(super.params) : super.implementation();

  NavigationRequestCallback? onRequest;

  @override
  Future<void> setOnNavigationRequest(NavigationRequestCallback onNavigationRequest) async =>
      onRequest = onNavigationRequest;
}

class _Platform extends WebViewPlatform with MockPlatformInterfaceMixin {
  final List<_Page> pages = <_Page>[];
  _Navigation? navigation;

  /// Whether the next page finds Mermaid.
  bool mermaid = true;

  @override
  PlatformWebViewController createPlatformWebViewController(
    PlatformWebViewControllerCreationParams params,
  ) {
    final _Page page = _Page(params)..mermaidLoaded = mermaid;
    pages.add(page);
    return page;
  }

  @override
  PlatformNavigationDelegate createPlatformNavigationDelegate(
    PlatformNavigationDelegateCreationParams params,
  ) => navigation = _Navigation(params);
}

const DiagramRequest request = DiagramRequest(
  code: 'flowchart TD\nA-->B',
  theme: DiagramTheme.dark,
  width: 320,
  density: 2.5,
);

void main() {
  late _Platform platform;

  setUp(() {
    platform = _Platform();
    WebViewPlatform.instance = platform;
  });

  test('starts the page once: JavaScript on, only the local asset, one channel', () async {
    final WebViewDiagramEngine engine = WebViewDiagramEngine();
    // Created lazily, on the first drawing.
    expect(platform.pages, isEmpty);

    final Future<DiagramResult> first = engine.draw(request);
    await Future<void>.delayed(Duration.zero);
    final _Page page = platform.pages.single;
    page.post(<String, Object?>{
      'id': 0,
      'png': base64Encode(<int>[1, 2, 3]),
    });
    expect(await first, isA<DiagramDrawn>());

    expect(page.mode, JavaScriptMode.unrestricted);
    expect(page.asset, mermaidPage);
    expect(page.channels.keys, <String>['Diagram']);
    expect(page.scripts.single, 'draw(0, ${jsonEncode(request.code)}, "dark", 320.0, 2.5)');
  });

  test('S-100 · every navigation away from the asset is refused', () async {
    final WebViewDiagramEngine engine = WebViewDiagramEngine();
    unawaited(engine.draw(request));
    await Future<void>.delayed(Duration.zero);
    final NavigationRequestCallback decide = platform.navigation!.onRequest!;

    expect(
      await decide(
        const NavigationRequest(
          url: 'file:///android_asset/flutter_assets/assets/mermaid/mermaid.html',
          isMainFrame: true,
        ),
      ),
      NavigationDecision.navigate,
    );
    expect(
      await decide(const NavigationRequest(url: 'https://evil.example.com/', isMainFrame: true)),
      NavigationDecision.prevent,
    );
    expect(
      await decide(const NavigationRequest(url: 'javascript:alert(1)', isMainFrame: true)),
      NavigationDecision.prevent,
    );
    expect(
      await decide(const NavigationRequest(url: 'file:///etc/passwd', isMainFrame: true)),
      NavigationDecision.prevent,
    );
  });

  test('answers by the id of each request, and keeps the page for the next one', () async {
    final WebViewDiagramEngine engine = WebViewDiagramEngine();
    unawaited(engine.draw(request).then((_) {}));
    await Future<void>.delayed(Duration.zero);
    final _Page page = platform.pages.single;
    page.answer = (int id) => id == 1
        ? <String, Object?>{'invalid': true, 'line': 3}
        : <String, Object?>{
            'png': base64Encode(<int>[9]),
          };
    page.post(<String, Object?>{
      'id': 0,
      'png': base64Encode(<int>[1]),
    });

    final DiagramResult second = await engine.draw(request);

    expect((second as DiagramInvalid).line, 3);
    expect(platform.pages, hasLength(1));
  });

  test('an answer nobody waits for, or one that is not an answer, is dropped', () async {
    final WebViewDiagramEngine engine = WebViewDiagramEngine();
    final Future<DiagramResult> drawing = engine.draw(request);
    await Future<void>.delayed(Duration.zero);
    final _Page page = platform.pages.single;

    page.post(<String, Object?>{'id': 99, 'png': 'AA=='});
    page.channels['Diagram']!(const JavaScriptMessage(message: '"just a string"'));
    page.post(<String, Object?>{'ready': true});
    page.post(<String, Object?>{
      'id': 0,
      'png': base64Encode(<int>[5]),
    });
    page.post(<String, Object?>{
      'id': 0,
      'png': base64Encode(<int>[6]),
    });

    expect(((await drawing) as DiagramDrawn).png, <int>[5]);
  });

  test(
    'a page without Mermaid — the asset was not copied — is unavailable, and started again later',
    () async {
      platform.mermaid = false;
      final WebViewDiagramEngine engine = WebViewDiagramEngine();

      expect(await engine.draw(request), isA<DiagramUnavailable>());

      platform.mermaid = true;
      final Future<DiagramResult> again = engine.draw(request);
      await Future<void>.delayed(Duration.zero);
      expect(platform.pages, hasLength(2));
      platform.pages.last.post(<String, Object?>{
        'id': 0,
        'png': base64Encode(<int>[7]),
      });
      expect(await again, isA<DiagramDrawn>());
    },
  );
}
