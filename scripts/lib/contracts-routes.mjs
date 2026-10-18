/**
 * The orphan-route / orphan-schema gate (plan 28, B-48): `pnpm contracts:check` fails when the
 * backend registers a REST route with no generated-type contract, and when a schema's own
 * `"x-route"` names a route nobody registers — the two ways a route and its schema can drift
 * apart without either side's own test noticing.
 *
 * A route is covered exactly one way: named by some `x-kind: "http"` schema's `"x-route"`, or
 * named in {@link EXCEPTIONS_FILE} with a reason. Never both, never neither.
 */

import fs from 'node:fs';
import path from 'node:path';

import { filesUnder } from './files.mjs';
import { scanHttpRoutes } from './http-routes.mjs';

/** Where the HTTP contract's schemas live. */
export const HTTP_SCHEMA_DIR = 'packages/contracts/schema/http';

/** The routes this gate accepts without a schema, and why — repository-relative. */
export const EXCEPTIONS_FILE = 'scripts/contracts-route-exceptions.json';

/**
 * @typedef {object} RouteRef
 * @property {string} method one of GET, POST, PUT, PATCH, DELETE
 * @property {string} path absolute, leading slash
 */

/**
 * @typedef {object} SchemaRoute
 * @property {string} method
 * @property {string} path
 * @property {string} schema repository-relative path of the schema that names it
 */

/** @param {RouteRef} route */
function key(route) {
  return `${route.method} ${route.path}`;
}

/**
 * Every `"x-route"` entry of every `x-kind: "http"` schema under {@link HTTP_SCHEMA_DIR}, read
 * directly off disk — `JSON.parse` of the file, not the generator's model builder, since all this
 * needs is the vendor-extension metadata, not a built type.
 *
 * @param {string} rootDir the repository root
 * @returns {SchemaRoute[]}
 */
export function schemaRoutes(rootDir) {
  const base = path.join(rootDir, HTTP_SCHEMA_DIR);

  return filesUnder(base, ['.schema.json'])
    .map((full) => path.relative(rootDir, full).split(path.sep).join('/'))
    .sort()
    .flatMap((relative) => {
      const schema = /** @type {Record<string, unknown>} */ (
        JSON.parse(fs.readFileSync(path.join(rootDir, relative), 'utf8'))
      );

      if (schema['x-kind'] !== 'http') {
        return [];
      }

      const routes = /** @type {RouteRef[]} */ (schema['x-route'] ?? []);
      return routes.map((route) => ({
        method: route.method,
        path: route.path,
        schema: relative,
      }));
    });
}

/**
 * @typedef {object} RouteException
 * @property {string} method
 * @property {string} path
 * @property {string} reason
 */

/**
 * The routes {@link EXCEPTIONS_FILE} accepts without a schema.
 *
 * @param {string} rootDir the repository root
 * @returns {RouteException[]}
 */
export function routeExceptions(rootDir) {
  const parsed = /** @type {{ entries: RouteException[] }} */ (
    JSON.parse(fs.readFileSync(path.join(rootDir, EXCEPTIONS_FILE), 'utf8'))
  );
  return parsed.entries;
}

/**
 * @typedef {'missingSchema' | 'unknownSchemaRoute' | 'staleException' | 'ambiguous'} RouteProblemKind
 */

/**
 * @typedef {object} RouteProblem
 * @property {RouteProblemKind} kind
 * @property {string} method
 * @property {string} path
 * @property {string} detail
 */

/**
 * Every schema or exception that names a route {@link realKeys} does not contain — a typo, or a
 * route renamed on one side and not the other.
 *
 * @param {SchemaRoute[]} schema
 * @param {RouteException[]} exceptions
 * @param {Set<string>} realKeys
 * @returns {RouteProblem[]}
 */
function unmatchedNames(schema, exceptions, realKeys) {
  const unknownSchema = schema
    .filter((route) => !realKeys.has(key(route)))
    .map(
      (route) =>
        /** @type {RouteProblem} */ ({
          kind: 'unknownSchemaRoute',
          method: route.method,
          path: route.path,
          detail: `${route.schema} names a route no controller registers`,
        }),
    );

  const stale = exceptions
    .filter((exception) => !realKeys.has(key(exception)))
    .map(
      (exception) =>
        /** @type {RouteProblem} */ ({
          kind: 'staleException',
          method: exception.method,
          path: exception.path,
          detail: `${EXCEPTIONS_FILE} names a route no controller registers`,
        }),
    );

  return [...unknownSchema, ...stale];
}

/**
 * How one real route is covered — by no schema, by an exception, by a schema, or ambiguously by
 * both — as the problem it is, or `null` when it is covered exactly one way.
 *
 * @param {import('./http-routes.mjs').HttpRoute} route
 * @param {Map<string, string[]>} schemaByKey
 * @param {Map<string, RouteException>} exceptionByKey
 * @returns {RouteProblem | null}
 */
function coverageProblem(route, schemaByKey, exceptionByKey) {
  const claimedBy = schemaByKey.get(key(route)) ?? [];
  const exception = exceptionByKey.get(key(route));

  if (claimedBy.length === 0 && exception === undefined) {
    return {
      kind: 'missingSchema',
      method: route.method,
      path: route.path,
      detail: `${route.file} registers a route with no schema and no exception`,
    };
  }

  if (claimedBy.length > 0 && exception !== undefined) {
    return {
      kind: 'ambiguous',
      method: route.method,
      path: route.path,
      detail: `named by both ${claimedBy.join(', ')} and ${EXCEPTIONS_FILE}`,
    };
  }

  return null;
}

/**
 * @param {SchemaRoute[]} schema
 * @returns {Map<string, string[]>} route key → the schema files that claim it
 */
function groupSchemaByKey(schema) {
  /** @type {Map<string, string[]>} */
  const byKey = new Map();

  for (const route of schema) {
    const list = byKey.get(key(route)) ?? [];
    list.push(route.schema);
    byKey.set(key(route), list);
  }

  return byKey;
}

/**
 * Cross-references the backend's real routes (from {@link scanHttpRoutes}) against every schema's
 * `"x-route"` and {@link EXCEPTIONS_FILE}, and reports every way the three disagree:
 *
 * - `missingSchema` — a real route with no schema and no exception;
 * - `unknownSchemaRoute` — a schema's `"x-route"` naming a route nobody registers (a typo, or a
 *   route renamed on one side and not the other);
 * - `staleException` — an exception naming a route nobody registers any more;
 * - `ambiguous` — a real route named by both a schema and the exceptions file.
 *
 * @param {string} rootDir the repository root
 * @returns {RouteProblem[]} empty when the three fully agree
 */
export function checkRoutes(rootDir) {
  const real = scanHttpRoutes(rootDir);
  const schema = schemaRoutes(rootDir);
  const exceptions = routeExceptions(rootDir);

  const realKeys = new Set(real.map(key));
  const schemaByKey = groupSchemaByKey(schema);
  const exceptionByKey = new Map(exceptions.map((exception) => [key(exception), exception]));

  const coverage = real
    .map((route) => coverageProblem(route, schemaByKey, exceptionByKey))
    .filter((problem) => problem !== null);

  return [...unmatchedNames(schema, exceptions, realKeys), ...coverage];
}
