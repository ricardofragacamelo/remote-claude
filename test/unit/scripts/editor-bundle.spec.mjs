import { describe, expect, it } from 'vitest';

import {
  analyseEditorBundle,
  editorBundleProblems,
  initialChunks,
  isMonacoModule,
  isPreviewModule,
} from '../../../scripts/lib/editor-bundle.mjs';

/**
 * How the editor ships, read from a build — plan 07, D-09, S-204. A made-up output stands in for
 * Rollup's; `web/test/integration/features/editor/editor-bundle.spec.ts` runs the real build.
 */

const PDFJS = '/repo/node_modules/.pnpm/pdfjs-dist@6.3.289/node_modules/pdfjs-dist/build/pdf.mjs';

const MONACO =
  '/repo/node_modules/.pnpm/monaco-editor@0.57.0/node_modules/monaco-editor/esm/vs/editor/editor.api.js';

/**
 * @param {string} fileName
 * @param {{ isEntry?: boolean, imports?: string[], modules?: string[], code?: string }} [shape]
 */
function aChunk(fileName, shape = {}) {
  return {
    type: /** @type {const} */ ('chunk'),
    fileName,
    isEntry: shape.isEntry ?? false,
    imports: shape.imports ?? [],
    modules: Object.fromEntries((shape.modules ?? []).map((id) => [id, {}])),
    code: shape.code ?? '',
  };
}

/** @param {string} fileName @param {string | Uint8Array} source */
function anAsset(fileName, source) {
  return { type: /** @type {const} */ ('asset'), fileName, source };
}

describe('a module of Monaco', () => {
  it('is one under node_modules/monaco-editor, and nothing of ours', () => {
    expect(isMonacoModule(MONACO)).toBe(true);
    expect(isMonacoModule('/repo/web/src/features/editor/lib/monaco-engine.ts')).toBe(false);
  });
});

describe('a module of the previews', () => {
  it('is one of pdf.js or of the markdown renderer, under node_modules', () => {
    expect(isPreviewModule(PDFJS)).toBe(true);
    expect(
      isPreviewModule(
        '/repo/node_modules/.pnpm/react-markdown@10/node_modules/react-markdown/x.js',
      ),
    ).toBe(true);
    expect(isPreviewModule('/repo/web/src/features/editor/lib/pdfjs-engine.ts')).toBe(false);
  });
});

describe('the chunks of the first page', () => {
  it('are the entries and what they import statically — never what a dynamic import reaches', () => {
    const entry = aChunk('index.js', { isEntry: true, imports: ['vendor.js', 'missing.js'] });
    const vendor = aChunk('vendor.js', { imports: ['index.js'] });
    const lazy = aChunk('monaco.js');

    expect(initialChunks([entry, vendor, lazy]).map((chunk) => chunk.fileName)).toEqual([
      'index.js',
      'vendor.js',
    ]);
  });
});

describe('the editor in a build', () => {
  const entry = aChunk('index.js', { isEntry: true, code: 'import("./monaco.js")' });
  const lazy = aChunk('monaco.js', { modules: [MONACO] });
  const worker = anAsset('assets/editor.worker-abc.js', 'self.onmessage = () => {}');
  const pdfWorker = anAsset('assets/pdf.worker.min-def.mjs', 'self.onmessage = () => {}');
  const previews = aChunk('pdfjs-engine.js', { modules: [PDFJS] });

  it('ships as D-09 decided: Monaco lazy, its worker ours, no CDN', () => {
    const bundle = analyseEditorBundle([
      entry,
      lazy,
      worker,
      previews,
      pdfWorker,
      anAsset('logo.png', new Uint8Array()),
    ]);

    expect(bundle).toEqual({
      initialMonacoModules: [],
      lazyChunks: ['monaco.js'],
      worker: 'assets/editor.worker-abc.js',
      cdnHits: [],
      initialPreviewModules: [],
      pdfWorker: 'assets/pdf.worker.min-def.mjs',
    });
    expect(editorBundleProblems(bundle)).toEqual([]);
  });

  it('says so when the first page carries Monaco, the worker is missing and a file names a CDN', () => {
    const eager = aChunk('index.js', {
      isEntry: true,
      modules: [MONACO, PDFJS],
      code: 'loader.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor" } })',
    });
    const bundle = analyseEditorBundle([
      eager,
      anAsset('index.html', '<script src="https://unpkg.com/x">'),
    ]);

    expect(editorBundleProblems(bundle)).toEqual([
      `the first page loads ${MONACO}`,
      'no chunk holds Monaco: the editor is not in the build',
      'the editor worker is not emitted by our build',
      'names a CDN — index.js: cdn.jsdelivr.net',
      'names a CDN — index.html: unpkg.com',
      `the first page loads ${PDFJS}`,
      'the PDF worker is not emitted by our build',
    ]);
  });
});
