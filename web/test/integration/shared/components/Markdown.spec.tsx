import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { fencedCodeOf, Markdown } from '@/shared/components/markdown/Markdown';
import type { RelativeImageProps } from '@/shared/components/markdown/Markdown';
import { render, translator } from '../../../support/render';

const t = translator('en');

function Picture({ src, alt }: RelativeImageProps): React.JSX.Element {
  return <span data-testid="picture" data-src={src} data-alt={alt} />;
}

describe('the safe markdown renderer — plan 07 · B-50, plan 08 · D-04', () => {
  it('renders GitHub markdown: tables, task lists, strikethrough, code', () => {
    render(
      <Markdown
        source={[
          '| a | b |',
          '|---|---|',
          '| 1 | 2 |',
          '',
          '- [x] done',
          '',
          '~~old~~ `code`',
        ].join('\n')}
      />,
    );

    expect(screen.getByRole('table')).toBeVisible();
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.getByText('old').tagName).toBe('DEL');
    expect(screen.getByText('code').tagName).toBe('CODE');
  });

  it('drops raw HTML, keeping no element of it (S-308)', () => {
    const { container } = render(
      <Markdown
        source={
          '<script>alert(1)</script>\n\n<iframe src="x"></iframe>\n\nok <span onclick="x">t</span>'
        }
      />,
    );

    expect(container.querySelector('script, iframe, [onclick]')).toBeNull();
    expect(screen.getByText(/ok/)).toBeVisible();
  });

  it('opens web links outside, keeps mail links, and turns what it cannot follow into text', async () => {
    const user = userEvent.setup();
    const followed = vi.fn();
    render(
      <Markdown
        source={
          '[web](https://a.example) [mail](mailto:a@b.c) [here](#top) [bad](javascript:x) [rel](a.md)'
        }
        onRelativeLink={followed}
      />,
    );

    expect(screen.getByRole('link', { name: 'web' })).toHaveAttribute(
      'rel',
      'noopener noreferrer nofollow',
    );
    expect(screen.getByRole('link', { name: 'mail' })).toHaveAttribute('href', 'mailto:a@b.c');
    expect(screen.queryByRole('link', { name: 'here' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'bad' })).toBeNull();

    await user.click(screen.getByRole('link', { name: 'rel' }));
    expect(followed).toHaveBeenCalledWith('a.md');
  });

  it('shows a relative link as its words, and a relative image as its text, with nobody to resolve them', () => {
    render(<Markdown source={'[rel](a.md) ![shot](img/a.png)'} />);

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('rel')).toBeVisible();
    expect(screen.getByText('shot')).toBeVisible();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('hands a relative image to the host, and never loads a remote one — a link to it, named by its URL without words', () => {
    render(
      <Markdown
        source={'![shot](img/a.png) ![](https://x.example/p.png)'}
        relativeImage={Picture}
      />,
    );

    const picture = screen.getByTestId('picture');
    expect(picture).toHaveAttribute('data-src', 'img/a.png');
    expect(picture).toHaveAttribute('data-alt', 'shot');
    expect(
      screen.getByRole('link', {
        name: t('markdown.image.remote', { name: 'https://x.example/p.png' }),
      }),
    ).toHaveAttribute('href', 'https://x.example/p.png');
    expect(document.querySelector('img')).toBeNull();
  });

  it('hands each fenced block to the host, with the language its fence named — plan 08 · B-15', () => {
    const renderCode = vi.fn((code: string, language: string) => (
      <output data-language={language}>{code}</output>
    ));
    render(
      <Markdown source={'```ts\nconst a = 1;\n```\n\n```\nplain\n```'} renderCode={renderCode} />,
    );

    expect(renderCode.mock.calls).toEqual([
      ['const a = 1;', 'ts'],
      ['plain', ''],
    ]);
  });

  it('hands code inline in the text to the host, and takes plugins of the text', () => {
    const plugin = vi.fn(() => () => undefined);
    render(
      <Markdown
        source={'use `pnpm test`'}
        renderInlineCode={(code) => <kbd>{code}</kbd>}
        remarkPlugins={[plugin]}
      />,
    );

    expect(screen.getByText('pnpm test').tagName).toBe('KBD');
    expect(plugin).toHaveBeenCalled();
  });
});

describe('the code of a fenced block', () => {
  it('reads the text and the language of the code in it', () => {
    const text = 'x = 1\n';
    expect(fencedCodeOf(<code className="language-py">{text}</code>)).toEqual({
      code: 'x = 1',
      language: 'py',
      closed: false,
    });
  });

  it('reads an empty block, and a block with no language, as nothing', () => {
    expect(fencedCodeOf(<code />)).toEqual({ code: '', language: '', closed: false });
  });

  it('reads anything but one code element as no code', () => {
    expect(fencedCodeOf('just text')).toEqual({ code: '', language: '', closed: false });
  });
});
