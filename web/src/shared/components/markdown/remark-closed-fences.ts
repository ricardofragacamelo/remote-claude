/** The few parts of a markdown tree this plugin reads and writes. */
interface MarkdownNode {
  readonly type: string;
  readonly position?: {
    readonly start: { readonly offset?: number };
    readonly end: { readonly offset?: number };
  };
  data?: { hProperties?: Record<string, unknown> };
  readonly children?: readonly MarkdownNode[];
}

/** The fence a block opens with — three or more backticks or tildes, indented at most three. */
const OPENING = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Whether the fenced block written from `start` to `end` of `source` has its closing fence — a line
 * of the fence's character, at least as long as the opening, after any quote marks. A block still
 * being streamed runs to the end of the text with no such line (21 · D-14).
 */
export function isClosedFence(source: string, start: number, end: number): boolean {
  const lines = source.slice(start, end).split('\n');
  const fence = OPENING.exec(lines[0] ?? '')?.[1];

  if (fence === undefined || lines.length < 2) {
    return false;
  }

  const last = (lines.at(-1) ?? '').replace(/^[\s>]*/, '').trimEnd();
  return last.length >= fence.length && [...last].every((character) => character === fence[0]);
}

/** Marks every closed fenced block of a tree, depth first. */
function mark(node: MarkdownNode, source: string): void {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;

  if (node.type === 'code' && start !== undefined && end !== undefined) {
    if (isClosedFence(source, start, end)) {
      node.data = {
        ...node.data,
        hProperties: { ...node.data?.hProperties, 'data-closed': 'true' },
      };
    }
    return;
  }

  for (const child of node.children ?? []) {
    mark(child, source);
  }
}

/**
 * A plugin of the text that marks a fenced block whose closing fence is in the text — `data-closed`
 * on its `<code>` —, the only kind a diagram is drawn from: a fence still open in the middle of a
 * streamed answer is code until it closes (21 · D-14, S-62).
 */
export function remarkClosedFences(): (
  tree: MarkdownNode,
  file: { readonly value?: unknown },
) => void {
  return (tree, file) => {
    mark(tree, typeof file.value === 'string' ? file.value : '');
  };
}
