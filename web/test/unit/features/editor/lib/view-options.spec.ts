import { describe, expect, it } from 'vitest';

import { viewOptionsOf } from '@/features/editor/lib/view-options';
import { DEFAULT_PREFERENCES } from '@/features/editor/store/preferences.store';

describe('the options of a view — plan 07, S-257', () => {
  it('come from the preferences, zoomed, for every tab', () => {
    const options = viewOptionsOf(
      { ...DEFAULT_PREFERENCES, fontSize: 16, zoom: 125, font: 'browser', wordWrap: true },
      { label: 'Editor of a.ts', light: false, readOnly: false, indentation: null },
    );

    expect(options).toMatchObject({
      label: 'Editor of a.ts',
      fontSize: 20,
      fontFamily: 'monospace',
      tabSize: 4,
      insertSpaces: true,
      wordWrap: true,
      minimap: true,
      light: false,
    });
  });

  it("follow the file's own indentation over the preferences", () => {
    const options = viewOptionsOf(DEFAULT_PREFERENCES, {
      label: 'x',
      light: true,
      readOnly: true,
      indentation: { insertSpaces: false, size: 8 },
    });

    expect(options).toMatchObject({ tabSize: 8, insertSpaces: false, light: true, readOnly: true });
    expect(options.fontFamily).toContain('monospace');
  });
});
