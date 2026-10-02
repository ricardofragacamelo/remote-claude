import { fileLinksIn } from './file-links';

/** The few parts of a markdown tree this plugin reads and writes. */
interface MarkdownNode {
  readonly type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
}

/** The nodes whose text is never a link: a link already, and code. */
const UNTOUCHED = new Set(['link', 'linkReference', 'inlineCode', 'code', 'definition']);

/** The children of a node, with every name of a file of the folder turned into a link to it. */
function linked(children: readonly MarkdownNode[], folder: string): MarkdownNode[] {
  return children.flatMap((child): MarkdownNode[] => {
    if (child.type === 'text' && typeof child.value === 'string') {
      return fileLinksIn(child.value, folder).map((piece) =>
        piece.link === null
          ? { type: 'text', value: piece.text }
          : {
              type: 'link',
              // `./` so the link reads as relative whatever the name — `notes.md:3` alone would read
              // as a URL whose scheme is `notes.md`, which the safe URL refuses.
              url: `./${piece.link.path}${piece.link.line === null ? '' : `:${String(piece.link.line)}`}`,
              children: [{ type: 'text', value: piece.text }],
            },
      );
    }

    if (!UNTOUCHED.has(child.type) && child.children !== undefined) {
      child.children = linked(child.children, folder);
    }
    return [child];
  });
}

/**
 * A plugin of the text that makes every name of a file of the folder a link to it — what the panel
 * opens in the editor, at the line (plan 08, B-16). Detected here, in the client; opened through the
 * files API of plan 07, which fences it again.
 */
export function remarkFileLinks(folder: string): () => (tree: MarkdownNode) => void {
  return () => (tree) => {
    if (tree.children !== undefined) {
      tree.children = linked(tree.children, folder);
    }
  };
}
