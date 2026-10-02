import { describe, expect, it } from 'vitest';

import { fileLinkOf, fileLinksIn } from '@/features/session/lib/file-links';

const FOLDER = '/home/dev/project';

describe('a file of the folder named in a text — plan 08 B-16', () => {
  it.each([
    ['src/app.ts', { path: 'src/app.ts', line: null }],
    ['./src/app.ts', { path: 'src/app.ts', line: null }],
    ['src/app.ts:42', { path: 'src/app.ts', line: 42 }],
    ['src/app.ts:42:7', { path: 'src/app.ts', line: 42 }],
    ['README.md', { path: 'README.md', line: null }],
    [`${FOLDER}/src/app.ts:3`, { path: 'src/app.ts', line: 3 }],
  ])('reads %s as a file of the folder — S-69', (text, link) => {
    expect(fileLinkOf(text, FOLDER)).toEqual(link);
  });

  it.each([
    ['/etc/passwd.txt'],
    ['/home/dev/project-other/a.ts'],
    ['../secrets.env'],
    ['src/../../out.ts'],
    ['https://example.com/a.ts'],
    ['and/or'],
    ['a/b'],
    ['just words'],
    [FOLDER],
  ])('leaves %s as text — S-70', (text) => {
    expect(fileLinkOf(text, FOLDER)).toBeNull();
  });

  it('cuts a sentence where it names a file, and leaves the rest as it was', () => {
    expect(fileLinksIn('Look at src/app.ts:12 and/or README.md.', FOLDER)).toEqual([
      { text: 'Look at ', link: null },
      { text: 'src/app.ts:12', link: { path: 'src/app.ts', line: 12 } },
      { text: ' and/or ', link: null },
      { text: 'README.md', link: { path: 'README.md', line: null } },
      { text: '.', link: null },
    ]);
  });

  it('never links a path that sits inside a URL', () => {
    expect(fileLinksIn('see https://host.example/src/a.ts now', FOLDER)).toEqual([
      { text: 'see https://host.example/src/a.ts now', link: null },
    ]);
  });

  it('gives one plain piece for a text with no file in it', () => {
    expect(fileLinksIn('nothing here', FOLDER)).toEqual([{ text: 'nothing here', link: null }]);
  });

  it('gives no piece for an empty text', () => {
    expect(fileLinksIn('', FOLDER)).toEqual([]);
  });
});
