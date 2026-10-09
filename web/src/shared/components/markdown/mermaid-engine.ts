import DOMPurify from 'dompurify';
import mermaid from 'mermaid';
import type { MermaidConfig } from 'mermaid';

import type { Theme } from '@/shared/hooks/useTheme';
import { MAX_DIAGRAM_SOURCE } from './diagram';
import type { DiagramEngine, DiagramResult } from './diagram';
import { kindOfUrl } from './safe-url';

/**
 * What a `%%{init}%%` of the text may not change — the keys the product sets, and the ones that would
 * let a text bring its own CSS or fonts in (ADR-020, first layer).
 */
const SECURE_KEYS = [
  'secure',
  'securityLevel',
  'startOnLoad',
  'maxTextSize',
  'suppressErrorRendering',
  'maxEdges',
  'theme',
  'themeCSS',
  'themeVariables',
  'darkMode',
  'fontFamily',
  'altFontFamily',
  'htmlLabels',
  'dompurifyConfig',
];

/** How the product draws: strict, labels as SVG text, the theme of the page. */
export function mermaidConfig(theme: Theme): MermaidConfig {
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    maxTextSize: MAX_DIAGRAM_SOURCE,
    suppressErrorRendering: true,
    htmlLabels: false,
    theme: theme === 'dark' ? 'dark' : 'default',
    darkMode: theme === 'dark',
    secure: SECURE_KEYS,
  };
}

/** Elements no diagram needs, and every one of them a way out of it (ADR-020, second layer). */
const FORBIDDEN_TAGS = ['script', 'foreignObject', 'iframe', 'object', 'embed', 'image', 'feImage'];

/** A CSS `url()` or `@import` that points outside the SVG — what would make the page call a host. */
const OUTSIDE_CSS =
  /@import[^;]*;?|url\(\s*(?:"(?!\s*#)[^"]*"|'(?!\s*#)[^']*'|(?![\s'"#])[^)]*)\s*\)/gi;

/** Whether a value reaches outside the SVG through a `url()`. */
function loadsOutside(value: string): boolean {
  return value.replace(OUTSIDE_CSS, '') !== value;
}

/** Whether a reference stays inside the SVG — `#id`. */
function isInside(value: string): boolean {
  return value.trim().startsWith('#');
}

/** Rewrites a link of the diagram by the rule of every link of a text (ADR-020, third layer). */
function linked(anchor: Element): void {
  const href = anchor.getAttribute('href') ?? anchor.getAttribute('xlink:href') ?? '';
  const kind = kindOfUrl(href);

  anchor.removeAttribute('xlink:href');
  if (kind === 'web' || kind === 'mail') {
    anchor.setAttribute('href', href);
    anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noopener noreferrer nofollow');
  } else {
    anchor.removeAttribute('href');
    anchor.removeAttribute('target');
  }
}

/** One attribute of an element, kept only while it stays inside the SVG. */
function confineAttribute(element: Element, tag: string, name: string, value: string): void {
  const reference = name === 'href' || name === 'xlink:href';

  if (name === 'style') {
    element.setAttribute('style', value.replace(OUTSIDE_CSS, ''));
  } else if ((reference && tag !== 'a' && !isInside(value)) || loadsOutside(value)) {
    element.removeAttribute(name);
  }
}

/**
 * Takes from an element what reaches outside the SVG: a `href` off a link, a `url()` to a host in any
 * attribute (`fill`, `filter`, `mask`…), CSS that loads.
 */
function confined(element: Element): void {
  const tag = element.tagName.toLowerCase();

  for (const { name, value } of [...element.attributes]) {
    confineAttribute(element, tag, name, value);
  }
  if (tag === 'style') {
    element.textContent = (element.textContent ?? '').replace(OUTSIDE_CSS, '');
  }
  if (tag === 'a') linked(element);
}

/**
 * The SVG of a diagram, sanitized by us whatever Mermaid let through (ADR-020): the SVG profile of
 * DOMPurify, without scripts, `on*`, frames, embeds, foreign objects or images; references only
 * inside the SVG; no CSS that loads anything; and the links by the rule of the `Markdown`.
 */
export function sanitizedSvg(svg: string): string {
  const fragment = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: FORBIDDEN_TAGS,
    ADD_TAGS: ['style'],
    RETURN_DOM_FRAGMENT: true,
  });

  for (const element of fragment.querySelectorAll('*')) {
    confined(element);
  }

  // The diagram is one image, named by the element around it: the SVG itself — an image of its own,
  // named by its title — would make two.
  const root = fragment.querySelector('svg');
  for (const name of ['role', 'aria-roledescription', 'aria-labelledby', 'aria-describedby']) {
    root?.removeAttribute(name);
  }
  root?.setAttribute('aria-hidden', 'true');

  const holder = document.createElement('div');
  holder.append(fragment);
  return holder.innerHTML;
}

/** The line a parse error names — `null` when it names none. */
export function errorLine(error: unknown): number | null {
  const located = (error as { hash?: { loc?: { first_line?: unknown } } } | null)?.hash?.loc
    ?.first_line;
  if (typeof located === 'number') return located;

  const line = /line\s+(\d+)/i.exec(String(error))?.[1];
  return line === undefined ? null : Number(line);
}

/** Draws one diagram with Mermaid, in the theme asked. */
async function drawn(id: string, source: string, theme: Theme): Promise<DiagramResult> {
  mermaid.initialize(mermaidConfig(theme));

  try {
    const { svg } = await mermaid.render(id, source);
    return { kind: 'drawn', svg: sanitizedSvg(svg) };
  } catch (error) {
    return { kind: 'invalid', line: errorLine(error) };
  } finally {
    // What a failed drawing leaves in the page — Mermaid draws in a node of the body.
    document.getElementById(`d${id}`)?.remove();
  }
}

/**
 * The engine of the diagrams: Mermaid, strict, behind a queue — `mermaid.render` is not reentrant,
 * so the diagrams of a page are drawn one after the other (S-55) —, each SVG sanitized by us.
 */
export function createMermaidEngine(): DiagramEngine {
  let queue: Promise<unknown> = Promise.resolve();

  return {
    render: (id, source, theme) => {
      const next = queue.then(() => drawn(id, source, theme));
      queue = next.catch(() => undefined);
      return next;
    },
  };
}
