import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS = fs.readFileSync(
  path.resolve(import.meta.dirname, '../../../src/styles/globals.css'),
  'utf8',
);

/** The custom properties declared inside the first block that opens with `selector {`. */
function declaredIn(css: string, selector: string): Set<string> {
  const start = css.indexOf(`${selector} {`);

  if (start === -1) {
    return new Set();
  }

  const body = css.slice(start, css.indexOf('}', start));
  return new Set([...body.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => String(match[1])));
}

/** The variables a block reads with `var(--…)`. */
function readIn(css: string, selector: string): Set<string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf('}', start));
  return new Set([...body.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((match) => String(match[1])));
}

/** Every variable declared in one theme and not in the other — what the test fails on. */
function unpaired(css: string): string[] {
  const light = declaredIn(css, ':root');
  const dark = declaredIn(css, '.dark');

  return [
    ...[...light].filter((name) => !dark.has(name)).map((name) => `${name} only in light`),
    ...[...dark].filter((name) => !light.has(name)).map((name) => `${name} only in dark`),
  ];
}

describe('the theme tokens — plan 06, S-88', () => {
  it('define every variable in the light theme and in the dark one', () => {
    expect(declaredIn(CSS, ':root').size).toBeGreaterThan(10);
    expect(unpaired(CSS)).toEqual([]);
  });

  it('give every colour the utilities read a value in both themes', () => {
    const light = declaredIn(CSS, ':root');

    const missing = [...readIn(CSS, '@theme inline')].filter((name) => !light.has(name));

    expect(missing).toEqual([]);
  });

  it('would fail a variable that exists only under .dark — the check itself', () => {
    const broken = ':root { --a: 1; }\n.dark { --a: 2; --b: 3; }';

    expect(unpaired(broken)).toEqual(['--b only in dark']);
  });

  it('would fail a variable the dark theme forgot', () => {
    const broken = ':root { --a: 1; --b: 2; }\n.dark { --a: 2; }';

    expect(unpaired(broken)).toEqual(['--b only in light']);
  });
});

describe('the densities — plan 06, D-32', () => {
  it('changes only tokens of the scale, each of which exists in the default density', () => {
    const scale = declaredIn(CSS, '@theme');
    const comfortable = declaredIn(CSS, ":root[data-density='comfortable']");

    expect(comfortable.size).toBeGreaterThan(0);
    expect([...comfortable].filter((name) => !scale.has(name))).toEqual([]);
  });

  it('never changes the touch target, the same in both densities', () => {
    expect(declaredIn(CSS, ":root[data-density='comfortable']").has('--spacing-touch')).toBe(false);
  });
});
