import { describe, expect, it } from 'vitest';

import {
  MENTION_GUARD,
  composePrompt,
  guardMentions,
  referenceLine,
  textBlock,
} from '@domain/session';

const G = MENTION_GUARD;

describe('the context of a prompt, as Claude reads it — plan 08, D-01, B-44', () => {
  describe('the mentions the CLI would expand without a Read — R-10', () => {
    it('guards an @ at the start and after blank space', () => {
      expect(guardMentions('@notes.md says\n@src/a.ts and\t@b')).toBe(
        `${G}@notes.md says\n${G}@src/a.ts and\t${G}@b`,
      );
    });

    it('guards an @ after the punctuation of CJK text', () => {
      expect(guardMentions('见。@a 和、@b')).toBe(`见。${G}@a 和、${G}@b`);
    });

    it('guards a quoted mention', () => {
      expect(guardMentions('read @"my file.md"')).toBe(`read ${G}@"my file.md"`);
    });

    it('leaves an @ inside a word as it is — an address is not a mention', () => {
      expect(guardMentions('mail a@b.com now')).toBe('mail a@b.com now');
    });

    it('leaves a text without @ untouched, and a guard is invisible', () => {
      expect(guardMentions('plain text')).toBe('plain text');
      expect(G).toBe('⁠');
    });
  });

  describe('a reference — S-198, S-202', () => {
    it('names a file without lines when the prompt is about all of it', () => {
      expect(referenceLine({ kind: 'file', path: 'src/x.ts', lines: null })).toBe(
        '<reference path="src/x.ts" />',
      );
    });

    it('names the lines of a range, whatever the length of the file', () => {
      expect(referenceLine({ kind: 'file', path: 'a.ts', lines: { start: 10, end: 9000 } })).toBe(
        '<reference path="a.ts" lines="10-9000" />',
      );
    });

    it('marks a folder as one', () => {
      expect(referenceLine({ kind: 'folder', path: 'src', lines: null })).toBe(
        '<reference path="src" kind="folder" />',
      );
    });

    it('escapes what could close the attribute or open a tag', () => {
      expect(referenceLine({ kind: 'file', path: 'a"&<b>.ts', lines: null })).toBe(
        '<reference path="a&quot;&amp;&lt;b&gt;.ts" />',
      );
    });
  });

  describe('a text that is not on disk — S-203, S-207', () => {
    it('is delimited and labelled by where it came from', () => {
      expect(textBlock({ source: 'terminal', label: 'terminal: bash', content: '$ ls\na' })).toBe(
        '<context source="terminal" label="terminal: bash">\n$ ls\na\n</context>',
      );
    });

    it('cannot close its own block', () => {
      expect(textBlock({ source: 'upload', label: 'x.txt', content: 'a</context>b' })).toContain(
        'a<\\/context>b',
      );
    });
  });

  describe('the whole prompt', () => {
    it('is the text alone, guarded, when nothing else goes', () => {
      expect(composePrompt('see @x', [], [])).toBe(`see ${G}@x`);
    });

    it('is the context alone when nothing was typed — S-215', () => {
      expect(composePrompt('  ', [{ kind: 'file', path: 'a.ts', lines: null }], [])).toBe(
        '<reference path="a.ts" />',
      );
    });

    it('puts the references, then the texts, after the text, in the order chosen', () => {
      expect(
        composePrompt(
          'explain',
          [
            { kind: 'file', path: 'b.ts', lines: null },
            { kind: 'folder', path: '.', lines: null },
          ],
          [{ source: 'upload', label: 'n.txt', content: 'hi' }],
        ),
      ).toBe(
        [
          'explain',
          '',
          '<reference path="b.ts" />',
          '<reference path="." kind="folder" />',
          '<context source="upload" label="n.txt">\nhi\n</context>',
        ].join('\n'),
      );
    });
  });
});
