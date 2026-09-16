import { describe, expect, it } from 'vitest';

import { gatesFor, repositoryGates } from '../../../scripts/lib/gates.mjs';

describe('repositoryGates', () => {
  // S-71 — cheapest first, and always in the same order.
  it('runs the protocol’s order, cheapest first', () => {
    expect(repositoryGates(false).map((gate) => gate.name)).toEqual([
      'formatting',
      'lint',
      'types',
      'architecture',
      'duplication',
      'unit',
      'coverage',
    ]);
  });

  it('numbers the gates as the protocol numbers them', () => {
    expect(repositoryGates(true).map((gate) => gate.number)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
  });

  // S-73 — `verify:full` covers the eleven gates, not a subset of them.
  it('adds the expensive half, and adds it after the cheap one', () => {
    expect(
      repositoryGates(true)
        .slice(7)
        .map((gate) => gate.name),
    ).toEqual(['integration', 'e2e', 'security', 'contracts and i18n']);
  });

  it('the short list is a prefix of the long one — the same gates, not similar ones', () => {
    expect(repositoryGates(true).slice(0, 7)).toEqual(repositoryGates(false));
  });

  it('every gate is an npm script, so a person runs exactly what CI runs', () => {
    for (const gate of repositoryGates(true)) {
      expect(gate.command).toBe('pnpm');
      expect(gate.args[0]).toBe('run');
    }
  });
});

describe('gatesFor', () => {
  it('gives a workspace the same seven ideas, scoped to it', () => {
    const gates = gatesFor('web');

    expect(gates.map((gate) => gate.number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(gates[0]?.args).toContain('web');
  });

  it('runs a workspace’s own scripts inside it, and the shared tools at the root', () => {
    const gates = gatesFor('backend');
    const formatting = gates.find((gate) => gate.name === 'formatting');
    const types = gates.find((gate) => gate.name === 'types');

    expect(formatting?.dir).toBeUndefined();
    expect(types?.dir).toBe('backend');
  });
});
