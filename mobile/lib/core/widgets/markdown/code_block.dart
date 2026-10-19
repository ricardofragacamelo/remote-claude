/// A block of code of a markdown preview or a conversation message (plan 26, B-08) — the app's
/// pair of the web's `CodeBlock.tsx`.
///
/// Coloured by the fence's language, loaded once per block — monospaced when the language is
/// unknown or the block is past the highlight ceiling (D-10) — with "copy", which copies it exactly
/// and says so. Its own horizontal scroll, never the page's (plan 25, S-83).
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:re_highlight/languages/bash.dart';
import 'package:re_highlight/languages/c.dart';
import 'package:re_highlight/languages/cpp.dart';
import 'package:re_highlight/languages/csharp.dart';
import 'package:re_highlight/languages/css.dart';
import 'package:re_highlight/languages/dart.dart';
import 'package:re_highlight/languages/dockerfile.dart';
import 'package:re_highlight/languages/dos.dart';
import 'package:re_highlight/languages/go.dart';
import 'package:re_highlight/languages/graphql.dart';
import 'package:re_highlight/languages/ini.dart';
import 'package:re_highlight/languages/java.dart';
import 'package:re_highlight/languages/javascript.dart';
import 'package:re_highlight/languages/json.dart';
import 'package:re_highlight/languages/kotlin.dart';
import 'package:re_highlight/languages/less.dart';
import 'package:re_highlight/languages/lua.dart';
import 'package:re_highlight/languages/markdown.dart';
import 'package:re_highlight/languages/perl.dart';
import 'package:re_highlight/languages/php.dart';
import 'package:re_highlight/languages/powershell.dart';
import 'package:re_highlight/languages/python.dart';
import 'package:re_highlight/languages/r.dart';
import 'package:re_highlight/languages/ruby.dart';
import 'package:re_highlight/languages/rust.dart';
import 'package:re_highlight/languages/scss.dart';
import 'package:re_highlight/languages/sql.dart';
import 'package:re_highlight/languages/swift.dart';
import 'package:re_highlight/languages/typescript.dart';
import 'package:re_highlight/languages/xml.dart';
import 'package:re_highlight/languages/yaml.dart';
import 'package:re_highlight/re_highlight.dart';
import 'package:remote_claude/core/theme/app_theme.dart';
import 'package:remote_claude/core/widgets/markdown/highlight_theme.dart';
import 'package:remote_claude/core/widgets/markdown/language_of_fence.dart';
import 'package:remote_claude/l10n/generated/app_localizations.dart';

/// A block above this many lines is shown without highlight, with the same text (D-10).
const int highlightLineCeiling = 500;

/// The 32 languages of [languages], registered once under the id `re_highlight` knows each by.
final Highlight _highlighter = Highlight()
  ..registerLanguages(<String, Mode>{
    'c': langC,
    'cpp': langCpp,
    'csharp': langCsharp,
    'css': langCss,
    'dart': langDart,
    'dockerfile': langDockerfile,
    'dos': langDos,
    'go': langGo,
    'graphql': langGraphql,
    'ini': langIni,
    'java': langJava,
    'javascript': langJavascript,
    'json': langJson,
    'kotlin': langKotlin,
    'less': langLess,
    'lua': langLua,
    'markdown': langMarkdown,
    'perl': langPerl,
    'php': langPhp,
    'powershell': langPowershell,
    'python': langPython,
    'r': langR,
    'ruby': langRuby,
    'rust': langRust,
    'scss': langScss,
    'bash': langBash,
    'sql': langSql,
    'swift': langSwift,
    'typescript': langTypescript,
    'xml': langXml,
    'yaml': langYaml,
  });

/// A block of code — [language] is the fence's own name, `''` for none, the same as the web's
/// `CodeBlockProps.language`.
class CodeBlock extends StatelessWidget {
  const CodeBlock({required this.code, required this.language, super.key});

  final String code;
  final String language;

  @override
  Widget build(BuildContext context) {
    final String resolved = languageOfFence(language);
    final String? name = languages[resolved];
    final TextStyle? base = identifierStyle(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Row(
          children: <Widget>[
            if (name != null)
              Expanded(child: Text(name, style: Theme.of(context).textTheme.labelSmall))
            else
              const Spacer(),
            _CopyButton(code: code),
          ],
        ),
        DecoratedBox(
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(Tokens.radius),
          ),
          child: Padding(
            padding: const EdgeInsets.all(Tokens.spaceSm),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Text.rich(_spanOf(context, resolved, base), style: base),
            ),
          ),
        ),
      ],
    );
  }

  /// The highlighted text, or the plain one when the language is unknown, past the line ceiling, or
  /// the grammar itself fails — a block is never lost to a highlighting error.
  InlineSpan _spanOf(BuildContext context, String resolved, TextStyle? base) {
    if (resolved == plainText || _lineCountPast(code, highlightLineCeiling)) {
      return TextSpan(text: code);
    }

    final HighlightResult result = _highlighter.highlight(
      code: code,
      language: highlightEngineId(resolved),
    );
    if (result.errorRaised != null || result.illegal) {
      return TextSpan(text: code);
    }

    final TextSpanRenderer renderer = TextSpanRenderer(
      base,
      highlightThemeOf(Theme.of(context).brightness),
    );
    result.render(renderer);
    return renderer.span ?? TextSpan(text: code);
  }
}

/// Whether [text] has more than [ceiling] lines, without building the whole list of them.
bool _lineCountPast(String text, int ceiling) {
  int lines = 1;
  for (int i = 0; i < text.length; i++) {
    if (text.codeUnitAt(i) == 0x0A) {
      lines += 1;
      if (lines > ceiling) {
        return true;
      }
    }
  }
  return false;
}

/// Copies the code exactly, and announces it (plan 26, B-08).
class _CopyButton extends StatefulWidget {
  const _CopyButton({required this.code});

  final String code;

  @override
  State<_CopyButton> createState() => _CopyButtonState();
}

class _CopyButtonState extends State<_CopyButton> {
  bool _copied = false;

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: <Widget>[
        IconButton(
          icon: const Icon(Icons.copy_outlined),
          tooltip: l10n.codeCopy,
          onPressed: () async {
            await Clipboard.setData(ClipboardData(text: widget.code));
            if (mounted) {
              setState(() => _copied = true);
            }
          },
        ),
        Semantics(
          liveRegion: true,
          child: Text(_copied ? l10n.codeCopied : '', style: const TextStyle(fontSize: 0)),
        ),
      ],
    );
  }
}
