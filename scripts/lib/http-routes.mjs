/**
 * The REST routes the backend registers, read from its controllers without booting the app.
 *
 * `pnpm contracts:check` needs the real route table to tell a route with no generated-type
 * contract from one that has it (plan 28, B-48) — but booting Nest costs a database and a realm,
 * which a gate run on every save cannot afford. Every route in this backend is declared with a
 * literal `@Controller(...)` prefix and a literal `@Get(...)`/`@Post(...)`/… path, never built at
 * runtime, so reading the decorators is the same table Nest would register from, without the cost.
 */

import fs from 'node:fs';
import path from 'node:path';

import { filesUnder } from './files.mjs';

/** The decorators a route is declared with, and the HTTP method each one means. */
const METHOD_DECORATORS = /** @type {const} */ ({
  Get: 'GET',
  Post: 'POST',
  Put: 'PUT',
  Patch: 'PATCH',
  Delete: 'DELETE',
});

/**
 * @typedef {object} HttpRoute
 * @property {string} method one of GET, POST, PUT, PATCH, DELETE
 * @property {string} path absolute, leading slash, no trailing slash except the root `/`
 * @property {string} file repository-relative path of the controller that declares it
 */

/**
 * The argument list of a decorator call, from just after `Name(` to its matching `)` — read
 * character by character so a multi-line call, or one with a nested `(...)` of its own, still ends
 * at the right place. `null` when `open` is not immediately followed by a balanced close.
 *
 * @param {string} content
 * @param {number} open index of the opening `(`
 * @returns {{ text: string, end: number } | null}
 */
function balancedCall(content, open) {
  let depth = 0;

  for (let index = open; index < content.length; index += 1) {
    const char = content[index];

    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        return { text: content.slice(open + 1, index), end: index };
      }
    }
  }

  return null;
}

/**
 * One quoted string, anchored to the whole of [text] once trimmed — `null` when it is anything else.
 *
 * @param {string} text
 */
function wholeStringLiteral(text) {
  const match = /^'([^'\\]*(?:\\.[^'\\]*)*)'$|^"([^"\\]*(?:\\.[^"\\]*)*)"$/.exec(text.trim());
  return match === null ? null : (match[1] ?? match[2] ?? '');
}

/**
 * The paths a decorator's own argument names: none for an empty call, one for a single string
 * literal, several for an array literal of them — `null` for anything else (a variable, a call, a
 * template literal), which is not a path this scanner can read and not a path Nest reads at
 * runtime either without evaluating code this scanner deliberately never runs.
 *
 * @param {string} argumentText the balanced call's own text, between its parens
 * @returns {string[] | null}
 */
function literalPaths(argumentText) {
  const trimmed = argumentText.trim();

  if (trimmed === '') {
    return [];
  }

  const whole = wholeStringLiteral(trimmed);
  if (whole !== null) {
    return [whole];
  }

  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return null;
  }

  const items = trimmed
    .slice(1, -1)
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');
  const literals = items.map(wholeStringLiteral);

  return literals.some((literal) => literal === null) ? null : /** @type {string[]} */ (literals);
}

/**
 * Joins a controller's own prefix and a method's own path into one, collapsing the seam.
 *
 * @param {string} prefix
 * @param {string} methodPath
 */
function joined(prefix, methodPath) {
  const full = [prefix, methodPath].filter((part) => part !== '').join('/');
  return `/${full}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

/**
 * The routes one controller file declares.
 *
 * @param {string} absolutePath
 * @param {string} relativePath repository-relative, for {@link HttpRoute.file}
 * @returns {HttpRoute[]}
 */
export function routesInFile(absolutePath, relativePath) {
  const content = fs.readFileSync(absolutePath, 'utf8');
  const controllerMatch = /@Controller\s*\(/.exec(content);

  if (controllerMatch === null) {
    return [];
  }

  const controllerCall = balancedCall(
    content,
    controllerMatch.index + controllerMatch[0].length - 1,
  );
  const prefixLiterals = controllerCall === null ? [] : (literalPaths(controllerCall.text) ?? []);
  // `@Controller()` with nothing, or with an options object that names no `path`, answers at its
  // parent's root — the empty prefix.
  const prefix = prefixLiterals[0] ?? '';

  /** @type {HttpRoute[]} */
  const routes = [];
  const decoratorPattern = /@(Get|Post|Put|Patch|Delete)\s*\(/g;
  let match;

  while ((match = decoratorPattern.exec(content)) !== null) {
    const method = METHOD_DECORATORS[/** @type {keyof typeof METHOD_DECORATORS} */ (match[1])];
    const call = balancedCall(content, match.index + match[0].length - 1);

    if (call === null) {
      continue;
    }

    const paths = literalPaths(call.text);
    if (paths === null) {
      // Not a path this scanner can read — a variable, a helper call — so not a route either,
      // the same as if nothing were declared.
      continue;
    }
    // `@Get()` with nothing answers at the controller's own prefix — one route, the empty path.
    const methodPaths = paths.length === 0 ? [''] : paths;

    for (const methodPath of methodPaths) {
      routes.push({ method, path: joined(prefix, methodPath), file: relativePath });
    }
  }

  return routes;
}

/**
 * Every REST route the backend's inbound HTTP adapter declares, across every controller.
 *
 * @param {string} rootDir the repository root
 * @returns {HttpRoute[]} sorted by path then method, so the output is stable across a filesystem's
 *   own directory order
 */
export function scanHttpRoutes(rootDir) {
  const base = path.join(rootDir, 'backend/src/adapter/inbound/http');

  return filesUnder(base, ['.controller.ts'])
    .flatMap((absolutePath) =>
      routesInFile(absolutePath, path.relative(rootDir, absolutePath).split(path.sep).join('/')),
    )
    .sort(
      (left, right) =>
        left.path.localeCompare(right.path) || left.method.localeCompare(right.method),
    );
}
