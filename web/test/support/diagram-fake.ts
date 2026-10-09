import { setDiagramLoader } from '@/shared/components/markdown/mermaid-loader';
import type { DiagramEngine, DiagramResult } from '@/shared/components/markdown/diagram';
import type { Theme } from '@/shared/hooks/useTheme';

/** One drawing the fake was asked for. */
export interface DrawnDiagram {
  readonly id: string;
  readonly source: string;
  readonly theme: Theme;
}

/** The fake engine, and what it drew. */
export interface FakeDiagrams {
  readonly engine: DiagramEngine;
  readonly drawn: readonly DrawnDiagram[];
}

/**
 * A diagram engine for jsdom, where Mermaid cannot lay anything out (21 · R-04), standing in as the
 * engine of every `Markdown`: a source with `invalid` in it is invalid on line 2, any other is an SVG
 * with its id, its theme and its text — what the real one gives, minus the drawing.
 */
export function fakeDiagrams(): FakeDiagrams {
  const drawn: DrawnDiagram[] = [];
  const engine: DiagramEngine = {
    render: (id, source, theme) => {
      drawn.push({ id, source, theme });
      const result: DiagramResult = source.includes('invalid')
        ? { kind: 'invalid', line: 2 }
        : {
            kind: 'drawn',
            svg: `<svg id="${id}" data-theme="${theme}"><style>#${id} .node { fill: red }</style><text>${source.split('\n').at(-1) ?? ''}</text></svg>`,
          };
      return Promise.resolve(result);
    },
  };

  setDiagramLoader(() => Promise.resolve(engine));
  return { engine, drawn };
}
