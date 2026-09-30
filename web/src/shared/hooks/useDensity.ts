import { create } from 'zustand';

import { forgetVisitor, readVisitor, writeVisitor } from '@/shared/lib/visitor-storage';
import type { StorageSource } from '@/shared/lib/visitor-storage';

/**
 * How tight the interface is: `compact`, in the shape of the editor people know, or `comfortable`,
 * with taller rows and larger text. The 44 px touch target under `md` is the same in both
 * ([06 · D-32](../../../../docs/plans/06-workbench/decisions.md#d-32--o-que-a-f5-decidiu-na-execução)).
 */
export const DENSITIES = ['compact', 'comfortable'] as const;

export type Density = (typeof DENSITIES)[number];

/** The density of somebody who never picked one. */
export const DEFAULT_DENSITY: Density = 'compact';

const DENSITY_KEY = 'density';

function isDensity(value: unknown): value is Density {
  return (DENSITIES as readonly unknown[]).includes(value);
}

/**
 * The density a visitor starts with: the one they picked, and otherwise the default — a storage
 * that throws, or a value that is not one of ours, included (plan 06, S-206).
 */
export function initialDensity(storage?: StorageSource): Density {
  return (
    readVisitor(DENSITY_KEY, (value) => (isDensity(value) ? value : undefined), storage) ??
    DEFAULT_DENSITY
  );
}

/**
 * Puts a density on the page. The tokens of the scale hang from it (`globals.css`), so a component
 * never learns which one is on: it names `h-row` and `text-ui`, and the attribute decides their size.
 */
export function applyDensity(density: Density, root: HTMLElement = document.documentElement): void {
  root.dataset['density'] = density;
}

export interface DensityState {
  readonly density: Density;

  /** Picks a density, and keeps the choice for this browser — the default forgets it. */
  setDensity(density: Density): void;
}

/** The density of the interface — shared by the whole app, so a store of its own. */
export const useDensity = create<DensityState>((set) => ({
  density: initialDensity(),

  setDensity: (density) => {
    if (density === DEFAULT_DENSITY) {
      forgetVisitor(DENSITY_KEY);
    } else {
      writeVisitor(DENSITY_KEY, density);
    }
    set({ density });
  },
}));
