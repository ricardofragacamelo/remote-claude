import { afterEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { Files } from 'lucide-react';

import { useActiveView, viewOf } from '@/features/workbench/hooks/useActiveView';
import { activeOf, readLastFolder, writeLastFolder } from '@/features/workbench/hooks/last-folder';
import { VISITOR_PREFIX } from '@/shared/lib/visitor-storage';
import { HELD_VIEWS, workbenchViews } from '@/features/workbench/store/registries';
import type { ViewEntry } from '@/features/workbench';

const Explorer = (): null => null;

describe('the view of the side bar', () => {
  let unregister: (() => void) | undefined;

  afterEach(() => {
    unregister?.();
    unregister = undefined;
  });

  it('holds the places of Explorer, Search and the sessions until their plans arrive — S-112', () => {
    expect(workbenchViews.entries().map((view) => [view.id, view.placeholder])).toEqual([
      ['explorer', true],
      ['search', true],
      ['sessions', true],
    ]);
  });

  it('shows what a plan registers in the place it declared, instead of the placeholder — S-112', () => {
    const explorer: ViewEntry = {
      id: 'explorer',
      position: 100,
      labelKey: 'workbench.explorer.label',
      icon: Files,
      component: Explorer,
      placeholderKey: 'workbench.explorer.placeholder',
    };
    unregister = workbenchViews.register(explorer);

    const { result } = renderHook(() => useActiveView('explorer'));

    expect(result.current.component).toBe(Explorer);
    expect(workbenchViews.entries().map((view) => view.id)).toEqual([
      'explorer',
      'search',
      'sessions',
    ]);
  });

  it('falls back to the first view for an id no view has any more', () => {
    expect(viewOf(HELD_VIEWS, 'gone').id).toBe('explorer');
  });

  it('falls back to the place of the Explorer when even the bar is empty', () => {
    expect(viewOf([], 'search')).toBe(HELD_VIEWS[0]);
  });
});

describe('where "the workbench" is when nothing names a folder — S-187', () => {
  it('is the tab this browser had on screen last, while it is open', () => {
    expect(activeOf(['/a', '/b'], '/b')).toBe('/b');
  });

  it('is the first tab when the last one was closed meanwhile, or none was kept', () => {
    expect(activeOf(['/a', '/b'], '/gone')).toBe('/a');
    expect(activeOf(['/a', '/b'], undefined)).toBe('/a');
  });

  it('is nowhere when no tab is open', () => {
    expect(activeOf([], '/a')).toBeNull();
  });
});

describe('the tab this browser had on screen last', () => {
  it('reads back what was written', () => {
    writeLastFolder('/srv/projects/a');

    expect(readLastFolder()).toBe('/srv/projects/a');
  });

  it('reads nothing from a value that is not a path', () => {
    localStorage.setItem(`${VISITOR_PREFIX}workbench.lastFolder`, '42');

    expect(readLastFolder()).toBeUndefined();
  });
});
