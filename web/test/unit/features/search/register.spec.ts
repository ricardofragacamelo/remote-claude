import { describe, expect, it } from 'vitest';

import '@/features/search';
import { commandHosts } from '@/app/command-hosts';
import { paletteModes } from '@/features/commands';
import { registerSearch, unregisterSearch } from '@/features/search/register';

describe('Quick Open in the places of the shell — plan 11, B-14', () => {
  it('fills the palette’s empty-prefix mode and the Ctrl/Cmd+P host', () => {
    expect(paletteModes.entries().map((entry) => entry.id)).toContain('quickOpen');
    expect(commandHosts.entries().map((entry) => entry.id)).toContain('search');
  });

  it('refuses a second registration, and is taken back out whole', () => {
    expect(() => registerSearch()).toThrow(/already registered/);

    unregisterSearch();
    expect(paletteModes.entries().map((entry) => entry.id)).not.toContain('quickOpen');
    expect(commandHosts.entries().map((entry) => entry.id)).not.toContain('search');

    registerSearch();
    expect(paletteModes.entries().map((entry) => entry.id)).toContain('quickOpen');
  });
});
