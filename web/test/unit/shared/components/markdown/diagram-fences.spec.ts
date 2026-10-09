import { describe, expect, it } from 'vitest';

import { accessibleTitleOf, isDiagramFence } from '@/shared/components/markdown/diagram';
import {
  isClosedFence,
  remarkClosedFences,
} from '@/shared/components/markdown/remark-closed-fences';

/** A node of a markdown tree, as far as the plugin reads it. */
interface Node {
  readonly type: string;
  readonly position?: { readonly start: { offset?: number }; readonly end: { offset?: number } };
  data?: { hProperties?: Record<string, unknown> };
  readonly children?: Node[];
}

/** Whether the whole of `source`, one fenced block, is closed. */
const closed = (source: string): boolean => isClosedFence(source, 0, source.length);

describe('a closed fence — plan 21, D-14, S-62', () => {
  it('is one whose closing line is the fence again, at least as long', () => {
    expect(closed('```mermaid\ngraph TD\n```')).toBe(true);
    expect(closed('````mermaid\na\n`````')).toBe(true);
    expect(closed('~~~mermaid\na\n~~~')).toBe(true);
    expect(closed('```mermaid\na\n```  ')).toBe(true);
    // In a quote, the block starts after the marker; its closing line keeps it.
    const quoted = '> ```mermaid\n> a\n> ```';
    expect(isClosedFence(quoted, 2, quoted.length)).toBe(true);
  });

  it('is not one still open, nor one closed by another fence, nor an indented block', () => {
    expect(closed('```mermaid\ngraph TD\n  A --> B')).toBe(false);
    expect(closed('```mermaid')).toBe(false);
    expect(closed('````mermaid\na\n```')).toBe(false);
    expect(closed('```mermaid\na\n~~~')).toBe(false);
    expect(closed('    indented code\n    more')).toBe(false);
  });

  it('is marked on the code of the tree, and only there', () => {
    const source = '# t\n\n```mermaid\na\n```\n\n- ```js\n  b';
    const code: Node = { type: 'code', position: { start: { offset: 5 }, end: { offset: 21 } } };
    const open: Node = {
      type: 'code',
      position: { start: { offset: 25 }, end: { offset: source.length } },
    };
    const tree: Node = {
      type: 'root',
      children: [
        { type: 'heading' },
        code,
        { type: 'list', children: [{ type: 'listItem', children: [open] }] },
        { type: 'code' },
      ],
    };

    remarkClosedFences()(tree, { value: source });
    expect(code.data?.hProperties).toEqual({ 'data-closed': 'true' });
    expect(open.data).toBeUndefined();

    const bare: Node = { type: 'code', position: { start: { offset: 5 }, end: { offset: 21 } } };
    remarkClosedFences()({ type: 'root', children: [bare] }, {});
    expect(bare.data).toBeUndefined();
  });
});

describe('a diagram fence — S-61', () => {
  it('is mermaid in any case, and nothing longer', () => {
    expect(['mermaid', 'Mermaid', 'MERMAID'].map(isDiagramFence)).toEqual([true, true, true]);
    expect(['mermaidx', 'js', '', 'mer maid'].map(isDiagramFence)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it('names a diagram by its accTitle', () => {
    expect(accessibleTitleOf('graph TD\n  accTitle: The flow of a request\n  A --> B')).toBe(
      'The flow of a request',
    );
    expect(accessibleTitleOf('graph TD\n A --> B')).toBeNull();
    expect(accessibleTitleOf('accTitle:   ')).toBeNull();
  });
});
