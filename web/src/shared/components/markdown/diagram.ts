import type { Theme } from '@/shared/hooks/useTheme';

/**
 * What the `Markdown` knows of diagrams without loading Mermaid — kept apart from the engine, so the
 * renderer's chunk never pulls it in (21 · R-01).
 */

/** The longest source a diagram is drawn from — longer ones stay code (21 · D-13, S-57). */
export const MAX_DIAGRAM_SOURCE = 20_000;

/** A diagram drawn — sanitized SVG — or why it was not, with the line of the error when known. */
export type DiagramResult =
  | { readonly kind: 'drawn'; readonly svg: string }
  | { readonly kind: 'invalid'; readonly line: number | null };

/** What draws the diagrams of the `Markdown`. */
export interface DiagramEngine {
  /**
   * Draws a source into SVG, sanitized — one diagram at a time, in the order asked (S-55).
   *
   * @param id unique in the page: the ids inside the SVG and its styles are scoped by it (S-65)
   */
  render(id: string, source: string, theme: Theme): Promise<DiagramResult>;
}

/** Whether a fence names a diagram: its first word is `mermaid`, in any case (S-61). */
export function isDiagramFence(language: string): boolean {
  return language.toLowerCase() === 'mermaid';
}

/** The accessible title a diagram gives itself — `accTitle: …` — or `null`. */
export function accessibleTitleOf(source: string): string | null {
  const title = /^\s*accTitle\s*:(.*)$/m.exec(source)?.[1]?.trim();
  return title === undefined || title === '' ? null : title;
}
