import { describe, expect, it } from 'vitest';

import {
  columnsOf,
  INITIAL_LAYOUT,
  LAYOUT_LIMITS,
  layoutFrom,
  rowsOf,
} from '@/features/workbench/hooks/workbench-layout';

describe('a saved layout, as far as it can be trusted — plan 06, S-113', () => {
  it('keeps sizes inside their limits as they are', () => {
    expect(layoutFrom({ sideBar: 25, secondary: 35, panel: 40 })).toEqual({
      sideBar: 25,
      secondary: 35,
      panel: 40,
    });
  });

  it('brings a size past a limit back to the limit — no part dragged to nothing or to everything', () => {
    expect(layoutFrom({ sideBar: 1, secondary: 99, panel: 0 })).toEqual({
      sideBar: LAYOUT_LIMITS.sideBar.min,
      secondary: LAYOUT_LIMITS.secondary.max,
      panel: LAYOUT_LIMITS.panel.min,
    });
  });

  it.each([
    ['nothing', undefined],
    ['a number', 42],
    ['text', 'wide'],
    ['sizes that are not numbers', { sideBar: '30', secondary: null, panel: Number.NaN }],
  ])('answers the initial sizes for %s', (_case, saved) => {
    expect(layoutFrom(saved)).toEqual(INITIAL_LAYOUT);
  });

  it('keeps what can be kept and resets only what cannot', () => {
    expect(layoutFrom({ sideBar: 30, panel: 'x' })).toEqual({ ...INITIAL_LAYOUT, sideBar: 30 });
  });
});

describe('the columns and rows of a folder tab', () => {
  it('gives the centre what the side bars leave', () => {
    expect(columnsOf({ sideBar: 20, secondary: 30, panel: 30 }, true)).toEqual({
      sideBar: 20,
      center: 50,
      secondary: 30,
    });
  });

  it('gives the centre the side bar’s share too when the side bar is closed', () => {
    expect(columnsOf({ sideBar: 20, secondary: 30, panel: 30 }, false)).toEqual({
      center: 70,
      secondary: 30,
    });
  });

  it('splits the centre between the editor and the panel', () => {
    expect(rowsOf({ sideBar: 20, secondary: 30, panel: 25 })).toEqual({ editor: 75, panel: 25 });
  });
});
