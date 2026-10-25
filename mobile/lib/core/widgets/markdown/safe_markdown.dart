/// The one markdown renderer of the app (plan 26, B-07) — content nobody reviewed, drawn the same
/// way wherever it shows: a file preview (plan 25) or a message of the conversation (plan 26, F3).
///
/// HTML never becomes an element — inline HTML is already text, and a block of it becomes a code
/// block, inert. A link out of the app asks first, showing the address; a scheme that is not
/// `http`, `https` or `mailto` does not open, and says why. A remote image is never loaded — its
/// words and address stand in its place. [SafeMarkdown] knows none of folder, file or session: a
/// relative link or image resolves through the callbacks the caller gives it, which do.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:markdown/markdown.dart' as md;
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/markdown/code_block.dart';
import 'package:remote_claude/core/widgets/markdown/markdown_syntaxes.dart';
import 'package:remote_claude/core/widgets/markdown/mermaid_block.dart';
import 'package:remote_claude/core/widgets/markdown/open_link.dart';
import 'package:remote_claude/core/widgets/markdown/resolve_relative_link.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// Renders [data] as GitHub-flavoured markdown, safely.
class SafeMarkdown extends StatelessWidget {
  const SafeMarkdown({
    required this.data,
    this.from = '',
    this.onRelativeLink,
    this.imageResolver,
    this.codeBuilder,
    this.fileLinkOf,
    this.shrinkWrap = false,
    this.wrap = false,
    super.key,
  });

  /// The markdown source.
  final String data;

  /// Sized to its content, inside a scrollable the caller already has (a message of the
  /// conversation, say) — rather than scrolling on its own, the default, for a whole page of its
  /// own (the file preview).
  final bool shrinkWrap;

  /// Whether a table reflows to the viewport instead of scrolling sideways on its own (S-83): its
  /// columns share the available width and a cell's text wraps, the same choice the file viewer's
  /// "Quebra de linha" makes for its raw text.
  final bool wrap;

  /// Where [data] itself lives, for a link or image relative to it — `''` when it lives nowhere a
  /// relative link could resolve against (a chat message, say).
  final String from;

  /// Called with the resolved path of a link that stays inside the folder, and either the anchor a
  /// markdown link named (`#section`) or the line a file-path-like run of text named (`src/x.ts:42`,
  /// plan 26, B-10) — never both. `null`: such a link does nothing.
  final void Function(String path, {String? anchor, int? line})? onRelativeLink;

  /// Builds the widget of an image that stays inside the folder. `null`, or it answers `null`: the
  /// image shows its words instead, like a remote one.
  final Widget? Function(BuildContext context, String path, String alt)? imageResolver;

  /// Overrides how a fenced code block draws — the default is [CodeBlock].
  final Widget Function(String code, String language)? codeBuilder;

  /// Where a file-path-like run of text leads — `null` when the caller has no folder to resolve one
  /// against, or the text does not name a file of it (plan 26, B-10). A hit becomes a link, in a run
  /// of plain text and inside backticks alike; a miss stays exactly as it was.
  final (String path, int? line)? Function(String text)? fileLinkOf;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final (String path, int? line)? Function(String text)? links = fileLinkOf;

    return SelectionArea(
      child: Markdown(
        data: data,
        noScroll: shrinkWrap,
        padding: shrinkWrap ? EdgeInsets.zero : const EdgeInsets.all(16),
        extensionSet: md.ExtensionSet.gitHubFlavored,
        blockSyntaxes: appBlockSyntaxes,
        inlineSyntaxes: <md.InlineSyntax>[if (links != null) _FileLinkSyntax(links)],
        builders: <String, MarkdownElementBuilder>{
          mermaidTag: _ElementBuilder(
            (md.Element element) => MermaidBlock(code: element.textContent.trimRight()),
          ),
          'pre': _ElementBuilder((md.Element element) => _codeOf(element, codeBuilder)),
          if (links != null) ...<String, MarkdownElementBuilder>{
            'code': _ElementBuilder(
              (md.Element element) => _inlineCodeOf(context, element, links, onRelativeLink),
              isBlock: false,
            ),
            _fileLinkTag: _ElementBuilder(
              (md.Element element) => _fileLinkOf(element, onRelativeLink),
              isBlock: false,
            ),
          },
        },
        styleSheet: MarkdownStyleSheet.fromTheme(theme).copyWith(
          tableColumnWidth: wrap ? const FlexColumnWidth() : const IntrinsicColumnWidth(),
          code: identifierStyle(context),
        ),
        onTapLink: (String text, String? href, String title) =>
            unawaited(_handleLink(context, href ?? '')),
        imageBuilder: (Uri uri, String? title, String? alt) => _image(context, uri.toString(), alt),
      ),
    );
  }

  Future<void> _handleLink(BuildContext context, String href) async {
    final LinkTarget target = resolveLink(from, href);
    if (target case FileLink(:final String path, :final String? anchor)) {
      onRelativeLink?.call(path, anchor: anchor);
      return;
    }
    await openNonFileLink(context, target);
  }

  Widget _image(BuildContext context, String src, String? alt) {
    final LinkTarget target = resolveLink(from, src);
    final String name = (alt ?? '').isEmpty ? src : '$alt — $src';

    if (target case FileLink(:final String path)) {
      final Widget? resolved = imageResolver?.call(context, path, name);
      if (resolved != null) {
        return resolved;
      }
    }
    return AlternativeText(text: AppLocalizations.of(context).markdownRemoteImage(name));
  }
}

/// An element drawn by [build], whatever tag it is asked for — a block one unless [isBlock] says
/// otherwise, for an element that belongs inside a run of text (an inline code, a file link).
class _ElementBuilder extends MarkdownElementBuilder {
  _ElementBuilder(this._build, {this.isBlock = true});

  final Widget? Function(md.Element element) _build;
  final bool isBlock;

  @override
  bool isBlockElement() => isBlock;

  @override
  Widget? visitElementAfterWithContext(
    BuildContext context,
    md.Element element,
    TextStyle? preferredStyle,
    TextStyle? parentStyle,
  ) => _build(element);
}

/// The tag a recognized file-path-like run of plain text becomes (plan 26, B-10).
const String _fileLinkTag = 'rc-file-link';

/// The shape of a file-path-like run of text — the same pattern the caller's [SafeMarkdown.fileLinkOf]
/// validates a match against, kept here too so [SafeMarkdown] finds the candidates on its own.
const String _filePathPattern =
    r'(?:/|\.{1,2}/)?(?:[\w@.+-]+/)*[\w@+-][\w@.+-]*\.[A-Za-z0-9]{1,10}(?::\d+(?::\d+)?)?';

/// Scans plain text for a path-like run, a [_fileLinkTag] element when the caller says it names a
/// file, left as text otherwise.
class _FileLinkSyntax extends md.InlineSyntax {
  _FileLinkSyntax(this._links) : super(_filePathPattern);

  final (String path, int? line)? Function(String text) _links;

  @override
  bool onMatch(md.InlineParser parser, Match match) {
    final String text = match[0]!;
    final (String path, int? line)? link = _links(text);

    if (link == null) {
      parser.addNode(md.Text(text));
      return true;
    }

    parser.addNode(
      md.Element.text(_fileLinkTag, text)
        ..attributes['path'] = link.$1
        ..attributes['line'] = link.$2 == null ? '' : '${link.$2}',
    );
    return true;
  }
}

/// Inline code: a file link when the caller says its whole text names one, the default style
/// otherwise.
Widget _inlineCodeOf(
  BuildContext context,
  md.Element element,
  (String path, int? line)? Function(String text) links,
  void Function(String path, {String? anchor, int? line})? onTap,
) {
  final String code = element.textContent;
  final (String path, int? line)? link = links(code);

  return link == null
      ? Text(code, style: identifierStyle(context))
      : _FileLinkWidget(text: code, path: link.$1, line: link.$2, onTap: onTap);
}

/// The [_fileLinkTag] element [_FileLinkSyntax] made, drawn as a link.
Widget _fileLinkOf(
  md.Element element,
  void Function(String path, {String? anchor, int? line})? onTap,
) {
  final String? line = element.attributes['line'];

  return _FileLinkWidget(
    text: element.textContent,
    path: element.attributes['path'] ?? '',
    line: line == null || line.isEmpty ? null : int.tryParse(line),
    onTap: onTap,
  );
}

/// A path the app recognized in a message, drawn as a link (plan 26, B-10).
class _FileLinkWidget extends StatelessWidget {
  const _FileLinkWidget({required this.text, required this.path, this.line, this.onTap});

  final String text;
  final String path;
  final int? line;
  final void Function(String path, {String? anchor, int? line})? onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap == null ? null : () => onTap!(path, line: line),
    child: Text(
      text,
      style: identifierStyle(context)?.copyWith(
        decoration: TextDecoration.underline,
        color: Theme.of(context).colorScheme.primary,
      ),
    ),
  );
}

/// The code block of a fence (or of HTML shown as code): the language is the class the inner
/// `code` element carries, `language-xxx`, or `''` for none.
Widget _codeOf(md.Element element, Widget Function(String code, String language)? custom) {
  final md.Node? inner = element.children?.firstOrNull;
  final String? className = inner is md.Element ? inner.attributes['class'] : null;
  final String language = className != null && className.startsWith('language-')
      ? className.substring('language-'.length)
      : '';
  final String code = element.textContent.trimRight();

  return custom?.call(code, language) ?? CodeBlock(code: code, language: language);
}

/// The words in the place of an image that did not load.
class AlternativeText extends StatelessWidget {
  const AlternativeText({required this.text, super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Text(
    text,
    style: Theme.of(context).textTheme.bodySmall?.copyWith(fontStyle: FontStyle.italic),
  );
}
