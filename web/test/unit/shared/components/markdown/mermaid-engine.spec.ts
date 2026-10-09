import { afterEach, describe, expect, it, vi } from 'vitest';

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn((id: string, source: string) =>
    Promise.resolve({ svg: `<svg id="${id}"><text>${source}</text></svg>` }),
  ),
}));

vi.mock('mermaid', () => ({ default: mermaid }));

import {
  createMermaidEngine,
  errorLine,
  mermaidConfig,
  sanitizedSvg,
} from '@/shared/components/markdown/mermaid-engine';
import { MAX_DIAGRAM_SOURCE } from '@/shared/components/markdown/diagram';
import {
  drawingOf,
  keepDrawing,
  loadDiagramEngine,
  setDiagramLoader,
} from '@/shared/components/markdown/mermaid-loader';

afterEach(() => {
  setDiagramLoader();
  mermaid.render.mockClear();
  mermaid.initialize.mockClear();
});

/** The elements of a sanitized SVG, as a document reads them. */
function parsed(svg: string): Document {
  return new DOMParser().parseFromString(sanitizedSvg(svg), 'text/html');
}

describe('the first layer: Mermaid, strict — plan 21, ADR-020, S-56', () => {
  it('draws strict, never on load, labels as SVG text, the limit of D-13, the keys a text cannot change', () => {
    const config = mermaidConfig('light');

    expect(config).toMatchObject({
      startOnLoad: false,
      securityLevel: 'strict',
      maxTextSize: MAX_DIAGRAM_SOURCE,
      htmlLabels: false,
      theme: 'default',
      darkMode: false,
    });
    expect(config.secure).toEqual(
      expect.arrayContaining(['securityLevel', 'theme', 'themeCSS', 'htmlLabels', 'fontFamily']),
    );
    expect(mermaidConfig('dark')).toMatchObject({ theme: 'dark', darkMode: true });
    expect(MAX_DIAGRAM_SOURCE).toBe(20_000);
  });
});

describe('the second layer: our pass of DOMPurify — S-56', () => {
  it('takes out scripts, handlers, frames, embeds, foreign objects and images', () => {
    const doc = parsed(
      [
        '<svg xmlns="http://www.w3.org/2000/svg" onload="window.ran = 1">',
        '<script>window.ran = 2</script>',
        '<g onclick="window.ran = 3"><text onmouseover="x()">kept text</text></g>',
        '<foreignObject><div onclick="x()">html</div><script>y()</script></foreignObject>',
        '<iframe src="https://evil.example"></iframe><object data="x"></object><embed src="x">',
        '<image href="https://evil.example/pixel.png"></image>',
        '<filter><feImage href="https://evil.example/f.png"></feImage></filter>',
        '</svg>',
      ].join(''),
    );

    expect(doc.querySelector('svg')).not.toBeNull();
    expect(doc.body.textContent).toContain('kept text');
    for (const tag of [
      'script',
      'foreignObject',
      'iframe',
      'object',
      'embed',
      'image',
      'feImage',
    ]) {
      expect(doc.getElementsByTagName(tag)).toHaveLength(0);
    }
    for (const element of doc.querySelectorAll('*')) {
      expect([...element.attributes].some((attribute) => attribute.name.startsWith('on'))).toBe(
        false,
      );
    }
  });

  it('keeps what stays inside the SVG, and takes away what would make the page call a host', () => {
    const doc = parsed(
      [
        '<svg xmlns="http://www.w3.org/2000/svg">',
        '<style>@import url(https://evil.example/a.css); .a { fill: url(#grad); background: url("https://evil.example/b.png") }</style>',
        '<path id="p" marker-end="url(#arrow)" fill="url(https://evil.example/paint)" style="stroke: url(https://evil.example/s); fill: red"></path>',
        '<use href="#p"></use><use href="https://evil.example/sprite.svg#x"></use>',
        '<linearGradient id="g" href="#base"></linearGradient>',
        '<linearGradient id="h" href="https://evil.example/g.svg#x"></linearGradient>',
        '</svg>',
      ].join(''),
    );
    const style = doc.querySelector('style')?.textContent ?? '';
    const path = doc.querySelector('path') as Element;
    const uses = [...doc.querySelectorAll('use')].map((use) => use.getAttribute('href'));

    expect(style).toContain('url(#grad)');
    expect(style).not.toContain('evil.example');
    expect(path.getAttribute('marker-end')).toBe('url(#arrow)');
    expect(path.hasAttribute('fill')).toBe(false);
    expect(path.getAttribute('style')).not.toContain('evil.example');
    expect(path.getAttribute('style')).toContain('fill: red');
    expect(uses).not.toContain('https://evil.example/sprite.svg#x');
    const gradients = [...doc.querySelectorAll('linearGradient')].map((each) =>
      each.getAttribute('href'),
    );
    expect(gradients).toEqual(['#base', null]);
  });
});

describe('the SVG as one image — S-58', () => {
  it('leaves the naming to the element around it: the root loses its own roles', () => {
    const doc = parsed(
      '<svg xmlns="http://www.w3.org/2000/svg" role="graphics-document document" aria-roledescription="flowchart-v2" aria-labelledby="t" aria-describedby="d"><title id="t">A title</title><g role="graphics-symbol"></g></svg>',
    );
    const svg = doc.querySelector('svg') as Element;

    for (const name of ['role', 'aria-roledescription', 'aria-labelledby', 'aria-describedby']) {
      expect(svg.hasAttribute(name)).toBe(false);
    }
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(doc.querySelector('title')?.textContent).toBe('A title');
  });
});

describe('the third layer: the links of the Markdown — S-56', () => {
  it('opens http, https and mailto in a new tab with the rel; nothing else keeps an href', () => {
    const doc = parsed(
      [
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">',
        '<a href="https://example.com/a"><text>web</text></a>',
        '<a xlink:href="mailto:a@example.com"><text>mail</text></a>',
        '<a href="javascript:alert(1)"><text>script</text></a>',
        '<a href="data:text/html,x"><text>data</text></a>',
        '<a href="file:///etc/passwd"><text>file</text></a>',
        '</svg>',
      ].join(''),
    );
    const links = [...doc.querySelectorAll('a')];

    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://example.com/a',
      'mailto:a@example.com',
      null,
      null,
      null,
    ]);
    for (const link of links.slice(0, 2)) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer nofollow');
      expect(link.hasAttribute('xlink:href')).toBe(false);
    }
    expect(doc.body.textContent).toContain('script');
  });
});

describe('the engine — plan 21, B-16', () => {
  it('draws one diagram at a time, every one, each with its own SVG (S-55)', async () => {
    const engine = createMermaidEngine();
    let running = 0;
    let most = 0;
    mermaid.render.mockImplementation(async (id: string, source: string) => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running -= 1;
      return { svg: `<svg id="${id}"><text>${source}</text></svg>` };
    });

    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        engine.render(`d${String(n)}`, `graph TD; A${String(n)}`, 'light'),
      ),
    );

    expect(most).toBe(1);
    expect(results.map((result) => (result.kind === 'drawn' ? result.svg : ''))).toEqual(
      [1, 2, 3, 4, 5].map((n) => expect.stringContaining(`A${String(n)}`) as unknown as string),
    );
    expect(mermaid.initialize).toHaveBeenCalledTimes(5);
  });

  it('says an invalid diagram is one, with its line, and goes on to the next', async () => {
    const engine = createMermaidEngine();
    mermaid.render
      .mockRejectedValueOnce(
        Object.assign(new Error('Parse error'), { hash: { loc: { first_line: 3 } } }),
      )
      .mockRejectedValueOnce(new Error('Parse error on line 7:\n...'))
      .mockRejectedValueOnce(new Error('No diagram type detected'));
    const leftover = document.createElement('div');
    leftover.id = 'dbroken';
    document.body.append(leftover);

    await expect(engine.render('broken', 'graph', 'dark')).resolves.toEqual({
      kind: 'invalid',
      line: 3,
    });
    await expect(engine.render('b2', 'x', 'dark')).resolves.toEqual({ kind: 'invalid', line: 7 });
    await expect(engine.render('b3', 'x', 'dark')).resolves.toEqual({
      kind: 'invalid',
      line: null,
    });
    expect(document.getElementById('dbroken')).toBeNull();
    expect(mermaid.initialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: 'dark' }));
    await expect(engine.render('ok', 'graph TD; A', 'light')).resolves.toMatchObject({
      kind: 'drawn',
    });
  });

  it('reads the line of an error however it comes', () => {
    expect(errorLine({ hash: { loc: { first_line: 4 } } })).toBe(4);
    expect(errorLine(new Error('Lexical error on line 12. Unrecognized text.'))).toBe(12);
    expect(errorLine(null)).toBeNull();
  });
});

describe('the drawings kept — S-63', () => {
  it('keeps the last hundred, and forgets them with the engine', () => {
    for (let index = 0; index <= 100; index += 1) {
      keepDrawing(`key ${String(index)}`, { kind: 'invalid', line: index });
    }
    expect(drawingOf('key 0')).toBeUndefined();
    expect(drawingOf('key 100')).toEqual({ kind: 'invalid', line: 100 });
    keepDrawing('key 1', { kind: 'invalid', line: 1 });
    keepDrawing('key 101', { kind: 'invalid', line: 101 });
    expect(drawingOf('key 1')).toBeDefined();

    setDiagramLoader();
    expect(drawingOf('key 100')).toBeUndefined();
  });
});

describe('the loader of the engine — S-54', () => {
  it('loads Mermaid on demand and once, and forgets a load that failed', async () => {
    const first = loadDiagramEngine();
    expect(loadDiagramEngine()).toBe(first);
    await expect(first).resolves.toHaveProperty('render');

    const engine = { render: vi.fn() };
    const loader = vi.fn().mockRejectedValueOnce(new Error('chunk')).mockResolvedValueOnce(engine);
    setDiagramLoader(loader);
    await expect(loadDiagramEngine()).rejects.toThrow('chunk');
    await expect(loadDiagramEngine()).resolves.toBe(engine);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
