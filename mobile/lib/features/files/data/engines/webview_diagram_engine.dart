/// Mermaid in a WebView that is never on screen (plan 25, B-21, ADR-024).
///
/// The page and `mermaid.min.js` are assets of the app; every navigation away from them is refused,
/// the page's CSP forbids the network, and the one channel back answers by the id of the request.
/// The WebView is created on the first diagram and kept: starting it costs about a second, drawing
/// the next one tens of milliseconds.
library;

import 'dart:async';
import 'dart:convert';

import 'package:remote_claude/features/files/domain/ports/diagram_engine.dart';
import 'package:webview_flutter/webview_flutter.dart';

/// Where the page is, among the assets.
const String mermaidPage = 'assets/mermaid/mermaid.html';

/// How long the page may take to say it is ready.
const Duration _startDeadline = Duration(seconds: 15);

/// [DiagramEngine] over a WebView with the web's Mermaid.
class WebViewDiagramEngine implements DiagramEngine {
  WebViewDiagramEngine({WebViewController Function()? controller})
    : _newController = controller ?? WebViewController.new;

  final WebViewController Function() _newController;
  final Map<int, Completer<DiagramResult>> _waiting = <int, Completer<DiagramResult>>{};
  Future<WebViewController?>? _started;
  int _next = 0;

  @override
  Future<DiagramResult> draw(DiagramRequest request) async {
    final WebViewController? page = await (_started ??= _start());
    if (page == null) {
      _started = null;
      return const DiagramUnavailable();
    }

    final int id = _next++;
    final Completer<DiagramResult> done = Completer<DiagramResult>();
    _waiting[id] = done;
    await page.runJavaScript(
      'draw($id, ${jsonEncode(request.code)}, "${request.theme.name}", '
      '${request.width}, ${request.density})',
    );
    // An answer that comes after the queue gave up on it finds nobody waiting, and is dropped.
    return done.future.whenComplete(() => _waiting.remove(id));
  }

  Future<WebViewController?> _start() async {
    final Completer<bool> ready = Completer<bool>();
    final WebViewController page = _newController();

    await page.setJavaScriptMode(JavaScriptMode.unrestricted);
    await page.setNavigationDelegate(
      NavigationDelegate(
        onNavigationRequest: (NavigationRequest request) =>
            request.url.startsWith('file:///android_asset/') ||
                request.url.startsWith('file:///') && request.url.contains('flutter_assets')
            ? NavigationDecision.navigate
            : NavigationDecision.prevent,
      ),
    );
    await page.addJavaScriptChannel(
      'Diagram',
      onMessageReceived: (JavaScriptMessage message) => _answer(message.message, ready),
    );
    await page.loadFlutterAsset(mermaidPage);

    final bool started = await ready.future.timeout(_startDeadline, onTimeout: () => false);
    return started ? page : null;
  }

  void _answer(String message, Completer<bool> ready) {
    final Object? decoded = jsonDecode(message);
    if (decoded is! Map<String, Object?>) {
      return;
    }
    if (decoded.containsKey('ready')) {
      if (!ready.isCompleted) {
        ready.complete(decoded['ready'] == true);
      }
      return;
    }

    final Object? id = decoded['id'];
    final Completer<DiagramResult>? waiting = id is int ? _waiting[id] : null;
    if (waiting == null || waiting.isCompleted) {
      return;
    }
    waiting.complete(resultOf(decoded));
  }
}

/// What one answer of the page says.
DiagramResult resultOf(Map<String, Object?> answer) {
  final Object? png = answer['png'];
  if (png is String) {
    return DiagramDrawn(base64Decode(png));
  }
  final Object? line = answer['line'];
  return DiagramInvalid(line: line is int ? line : null);
}
