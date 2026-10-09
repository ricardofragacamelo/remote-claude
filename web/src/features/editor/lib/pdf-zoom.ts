import type { PdfScale } from '../types/pdf';

/** The steps of the zoom, as factors — 25 % to 500 %, the Firefox ones trimmed (21 · D-09). */
export const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5] as const;

/** The fits the zoom offers, in the order of the list. */
export const ZOOM_FITS = ['auto', 'page-width', 'page-fit'] as const;

/** What the reader opens at, and what `Ctrl+0` goes back to (21 · D-05). */
export const DEFAULT_SCALE: PdfScale = 'page-width';

/** Two factors closer than this are the same — what pdf.js computes for a fit is not exact. */
const SAME = 0.001;

const SMALLEST = Math.min(...ZOOM_STEPS);
const LARGEST = Math.max(...ZOOM_STEPS);

/** The step past `value`, towards larger — `null` at 500 % and above. */
export function zoomedIn(value: number): number | null {
  return ZOOM_STEPS.find((step) => step > value + SAME) ?? null;
}

/** The step before `value`, towards smaller — `null` at 25 % and below. */
export function zoomedOut(value: number): number | null {
  return [...ZOOM_STEPS].reverse().find((step) => step < value - SAME) ?? null;
}

/** Whether `value` is as small as the zoom goes. */
export function atSmallest(value: number): boolean {
  return value <= SMALLEST + SAME;
}

/** Whether `value` is as large as the zoom goes. */
export function atLargest(value: number): boolean {
  return value >= LARGEST - SAME;
}

/** A scale as the list of the zoom names it: a fit, or a factor. */
export function zoomOption(scale: PdfScale): string {
  return String(scale);
}

/** The scale an option of the list stands for. */
export function scaleOfOption(option: string): PdfScale {
  const fit = ZOOM_FITS.find((each) => each === option);
  return fit ?? Number(option);
}

/** A factor as a whole percent. */
export function percentOf(value: number): number {
  return Math.round(value * 100);
}
