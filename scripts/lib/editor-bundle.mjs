/**
 * What the build of the web says about the editor — plan 07, D-09 and S-204: Monaco is a chunk of
 * its own that only a dynamic import reaches, its worker is served from our build, and nothing names
 * a CDN to fetch it from. The previews of F7 (B-50) ship the same way: pdf.js and the markdown
 * renderer only in chunks a dynamic import reaches, the PDF worker emitted by our build.
 *
 * Pure: it reads the output of a Rollup build, never the disk, so it is tested with a made-up one.
 */

/** The hosts a CDN-loaded editor fetches from — none may appear in what we serve. */
export const CDN_HOSTS = ['cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com'];

/**
 * @typedef {object} BuiltChunk
 * @property {'chunk'} type
 * @property {string} fileName
 * @property {boolean} isEntry
 * @property {readonly string[]} imports the chunks it loads statically
 * @property {Readonly<Record<string, unknown>>} modules by module id
 * @property {string} code
 */

/**
 * @typedef {object} BuiltAsset
 * @property {'asset'} type
 * @property {string} fileName
 * @property {string | Uint8Array} source
 */

/**
 * @typedef {object} EditorBundle
 * @property {string[]} initialMonacoModules modules of Monaco the first page would load — none, or it fails
 * @property {string[]} lazyChunks the chunks holding Monaco, every one reached only by a dynamic import
 * @property {string | null} worker the editor's worker, as our build emits it
 * @property {string[]} cdnHits `file: host` for each file of the build that names a CDN
 * @property {string[]} initialPreviewModules modules of pdf.js, of the markdown renderer or of Mermaid the first
 *   page would load — none, or it fails
 * @property {string | null} pdfWorker the PDF worker, as our build emits it
 */

/**
 * The libraries of the previews, which the first page never loads (plan 07, B-50) — Mermaid among
 * them, several megabytes with d3, drawn only when a diagram is (plan 21, R-01, S-67).
 */
export const PREVIEW_LIBRARIES = ['pdfjs-dist', 'react-markdown', 'remark-gfm', 'mermaid'];

/** @param {string} id */
export function isPreviewModule(id) {
  return (
    id.includes('/node_modules/') && PREVIEW_LIBRARIES.some((name) => id.includes(`/${name}/`))
  );
}

/** @param {string} id */
export function isMonacoModule(id) {
  return id.includes('/node_modules/') && id.includes('monaco-editor');
}

/**
 * The chunks the first page loads: the entries and everything they import statically.
 *
 * @param {readonly BuiltChunk[]} chunks
 * @returns {BuiltChunk[]}
 */
export function initialChunks(chunks) {
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const seen = new Set();
  const queue = chunks.filter((chunk) => chunk.isEntry).map((chunk) => chunk.fileName);

  while (queue.length > 0) {
    const name = queue.pop();

    if (name !== undefined && !seen.has(name) && byName.has(name)) {
      seen.add(name);
      queue.push(...(byName.get(name)?.imports ?? []));
    }
  }

  return chunks.filter((chunk) => seen.has(chunk.fileName));
}

/** @param {BuiltChunk | BuiltAsset} file */
function textOf(file) {
  if (file.type === 'chunk') {
    return file.code;
  }

  return typeof file.source === 'string' ? file.source : '';
}

/**
 * What the build says about the editor.
 *
 * @param {readonly (BuiltChunk | BuiltAsset)[]} output
 * @returns {EditorBundle}
 */
export function analyseEditorBundle(output) {
  const chunks = /** @type {BuiltChunk[]} */ (output.filter((file) => file.type === 'chunk'));
  const initial = initialChunks(chunks);

  return {
    initialMonacoModules: initial.flatMap((chunk) =>
      Object.keys(chunk.modules).filter(isMonacoModule),
    ),
    lazyChunks: chunks
      .filter(
        (chunk) => !initial.includes(chunk) && Object.keys(chunk.modules).some(isMonacoModule),
      )
      .map((chunk) => chunk.fileName),
    worker:
      output.find((file) => /editor\.worker-[^/]*\.js$/.test(file.fileName))?.fileName ?? null,
    initialPreviewModules: initial.flatMap((chunk) =>
      Object.keys(chunk.modules).filter(isPreviewModule),
    ),
    pdfWorker:
      output.find((file) => /pdf\.worker(\.min)?-[^/]*\.m?js$/.test(file.fileName))?.fileName ??
      null,
    cdnHits: output.flatMap((file) =>
      CDN_HOSTS.filter((host) => textOf(file).includes(host)).map(
        (host) => `${file.fileName}: ${host}`,
      ),
    ),
  };
}

/**
 * The problems of a bundle, each said in words — empty when the editor ships as D-09 decided.
 *
 * @param {EditorBundle} bundle
 * @returns {string[]}
 */
export function editorBundleProblems(bundle) {
  return [
    ...bundle.initialMonacoModules.map((id) => `the first page loads ${id}`),
    ...(bundle.lazyChunks.length === 0
      ? ['no chunk holds Monaco: the editor is not in the build']
      : []),
    ...(bundle.worker === null ? ['the editor worker is not emitted by our build'] : []),
    ...bundle.cdnHits.map((hit) => `names a CDN — ${hit}`),
    ...bundle.initialPreviewModules.map((id) => `the first page loads ${id}`),
    ...(bundle.pdfWorker === null ? ['the PDF worker is not emitted by our build'] : []),
  ];
}
