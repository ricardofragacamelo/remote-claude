import { lazyEngine } from '@/shared/lib/lazy-engine';
import type { DiagramEngine, DiagramResult } from './diagram';

/** How the diagram engine is reached. */
export type DiagramLoader = () => Promise<DiagramEngine>;

/**
 * Mermaid is a chunk of its own — several megabytes with d3 — loaded by the first diagram drawn, once
 * per page, never part of the first page (21 · R-01; `PREVIEW_LIBRARIES` of the `editor-bundle`). A
 * load that failed is forgotten, so "try again" really tries again (S-54).
 */
const engine = lazyEngine<DiagramEngine>('markdown.diagram.load', () =>
  import('./mermaid-engine').then((module) => module.createMermaidEngine()),
);

/**
 * The diagram engine.
 *
 * @throws {Error} the chunk did not arrive
 */
export function loadDiagramEngine(): Promise<DiagramEngine> {
  return engine.load();
}

/** How many drawings are kept, so a block drawn again — same place, theme and source — is not. */
const KEPT = 100;

/** The drawings made in this page, by place, theme and source, the latest last (S-63). */
const drawings = new Map<string, DiagramResult>();

/** A drawing already made for `key`. */
export function drawingOf(key: string): DiagramResult | undefined {
  return drawings.get(key);
}

/** Keeps a drawing — the oldest one goes past {@link KEPT}. */
export function keepDrawing(key: string, result: DiagramResult): void {
  drawings.delete(key);
  drawings.set(key, result);
  if (drawings.size > KEPT) drawings.delete(drawings.keys().next().value as string);
}

/**
 * Stands another engine in — what jsdom tests do, where Mermaid cannot lay anything out — or, with
 * none, puts the default back. The drawings of the engine before are forgotten with it.
 */
export function setDiagramLoader(next?: DiagramLoader): void {
  engine.replace(next);
  drawings.clear();
}
