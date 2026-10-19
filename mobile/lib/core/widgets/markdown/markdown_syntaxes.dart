/// What the markdown parser of the app does differently from the stock one (plan 25, B-19, B-22).
///
/// Content nobody reviewed: HTML never becomes an element. Inline HTML already comes out as text;
/// a block of HTML would be dropped without a word, so it comes out as a code block — seen, inert.
/// A ```` ```mermaid ```` fence becomes an element of its own, which the diagram builder draws; every
/// other fence stays the code block it was.
library;

import 'package:markdown/markdown.dart' as md;

/// The tag a `mermaid` fence becomes.
const String mermaidTag = 'mermaid';

/// A block of HTML, shown as the code it is.
class HtmlAsCodeSyntax extends md.HtmlBlockSyntax {
  const HtmlAsCodeSyntax();

  @override
  md.Node parse(md.BlockParser parser) {
    final String html = parseChildLines(parser).map((md.Line line) => line.content).join('\n');
    return md.Element('pre', <md.Node>[md.Element.text('code', '$html\n')]);
  }
}

/// A fence: a `mermaid` one becomes [mermaidTag], with the code as its text.
class MermaidFenceSyntax extends md.FencedCodeBlockSyntax {
  const MermaidFenceSyntax();

  @override
  md.Node parse(md.BlockParser parser) {
    final md.Node fence = super.parse(parser);
    final md.Node? code = fence is md.Element ? fence.children?.firstOrNull : null;
    if (code is md.Element && code.attributes['class'] == 'language-$mermaidTag') {
      return md.Element.text(mermaidTag, code.textContent);
    }
    return fence;
  }
}

/// The block syntaxes of the app, tried before the stock ones.
const List<md.BlockSyntax> appBlockSyntaxes = <md.BlockSyntax>[
  MermaidFenceSyntax(),
  HtmlAsCodeSyntax(),
];
