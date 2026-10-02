import { describe, expect, it } from 'vitest';

import { remarkFileLinks } from '@/features/session/lib/remark-file-links';

const FOLDER = '/home/dev/project';

type Node = { type: string; value?: string; url?: string; children?: Node[] };

function run(tree: Node): Node {
  remarkFileLinks(FOLDER)()(tree as never);
  return tree;
}

describe('the markdown plugin that links the files of the folder — plan 08 B-16', () => {
  it('turns a file named in a paragraph into a relative link, with its line', () => {
    const tree = run({
      type: 'root',
      children: [{ type: 'paragraph', children: [{ type: 'text', value: 'open src/a.ts:3 now' }] }],
    });

    expect(tree.children?.[0]?.children).toEqual([
      { type: 'text', value: 'open ' },
      { type: 'link', url: './src/a.ts:3', children: [{ type: 'text', value: 'src/a.ts:3' }] },
      { type: 'text', value: ' now' },
    ]);
  });

  it('links a file with no line without a colon', () => {
    const tree = run({ type: 'root', children: [{ type: 'text', value: 'notes.md' }] });

    expect(tree.children?.[0]).toMatchObject({ type: 'link', url: './notes.md' });
  });

  it('never touches code, nor the text of a link that is one already', () => {
    const code: Node = { type: 'code', value: 'src/a.ts' };
    const link: Node = {
      type: 'link',
      url: 'https://x.example',
      children: [{ type: 'text', value: 'src/a.ts' }],
    };
    const tree = run({
      type: 'root',
      children: [code, link, { type: 'inlineCode', value: 'b.ts' }],
    });

    expect(tree.children).toEqual([code, link, { type: 'inlineCode', value: 'b.ts' }]);
  });

  it('leaves a tree with no children alone', () => {
    expect(run({ type: 'root' })).toEqual({ type: 'root' });
  });
});
