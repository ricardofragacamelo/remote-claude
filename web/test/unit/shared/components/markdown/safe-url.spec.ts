import { describe, expect, it } from 'vitest';

import { asText, kindOfUrl, safeUrl } from '@/shared/components/markdown/safe-url';

describe('the URLs a markdown text may keep — plan 08 · D-04', () => {
  it.each([
    ['https://example.com/a', 'web'],
    ['HTTP://example.com', 'web'],
    ['mailto:a@b.c', 'mail'],
    ['#section', 'anchor'],
    ['docs/guide.md', 'relative'],
    ['/README.md', 'relative'],
    ['../x.png', 'relative'],
    ['guide.md?x=1#y', 'relative'],
  ] as const)('keeps %s as %s', (url, kind) => {
    expect(kindOfUrl(url)).toBe(kind);
    expect(safeUrl(url)).toBe(url);
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>x</script>',
    'vbscript:x',
    'file:///etc/passwd',
    '//evil.example/x',
    '\\\\evil\\share',
    ' https://example.com',
    'java\tscript:alert(1)',
    'java\u0000script:x',
    'https://example.com\u007f',
    '',
  ])('refuses %j', (url) => {
    expect(kindOfUrl(url)).toBe('blocked');
    expect(safeUrl(url)).toBe('');
  });
});

describe('an attribute as text', () => {
  it('is the string it is, and nothing otherwise', () => {
    expect([asText('a'), asText(undefined), asText(new Blob())]).toEqual(['a', '', '']);
  });
});
