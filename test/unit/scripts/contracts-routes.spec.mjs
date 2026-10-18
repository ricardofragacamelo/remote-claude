import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  EXCEPTIONS_FILE,
  checkRoutes,
  routeExceptions,
  schemaRoutes,
} from '../../../scripts/lib/contracts-routes.mjs';
import { scanHttpRoutes } from '../../../scripts/lib/http-routes.mjs';

/**
 * The orphan-route / orphan-schema gate (plan 28, B-48): every route `scanHttpRoutes()` finds is
 * named exactly once, either by some schema's `"x-route"` or by `scripts/contracts-route-exceptions.json`
 * — never both, never neither. A gap on either side is exactly what let a route and its generated
 * type drift apart without either side's own test noticing.
 */

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');

/** @type {string[]} */
const temporary = [];

afterEach(() => {
  for (const dir of temporary.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** A repository-shaped scratch tree, empty until a test populates it. */
function scratchRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-contracts-routes-'));
  temporary.push(root);
  fs.mkdirSync(path.join(root, 'backend/src/adapter/inbound/http'), { recursive: true });
  fs.mkdirSync(path.join(root, 'packages/contracts/schema/http'), { recursive: true });
  return root;
}

/**
 * Writes one controller file, named so it ends in `.controller.ts` as the scanner requires.
 *
 * @param {string} root
 * @param {string} name
 * @param {string} content
 */
function writeController(root, name, content) {
  fs.writeFileSync(
    path.join(root, 'backend/src/adapter/inbound/http', `${name}.controller.ts`),
    content,
  );
}

/**
 * Writes one HTTP schema file under `packages/contracts/schema/http/`.
 *
 * @param {string} root
 * @param {string} name
 * @param {Record<string, unknown>} schema
 */
function writeSchema(root, name, schema) {
  fs.writeFileSync(
    path.join(root, 'packages/contracts/schema/http', `${name}.schema.json`),
    JSON.stringify(schema, null, 2),
  );
}

/**
 * Writes the exceptions file — `{ entries: [] }` when the test names none.
 *
 * @param {string} root
 * @param {{ method: string, path: string, reason: string }[]} [entries]
 */
function writeExceptions(root, entries = []) {
  fs.mkdirSync(path.join(root, path.dirname(EXCEPTIONS_FILE)), { recursive: true });
  fs.writeFileSync(path.join(root, EXCEPTIONS_FILE), JSON.stringify({ entries }, null, 2));
}

/**
 * A minimal `x-kind: "http"` schema naming the given routes.
 *
 * @param {{ method: string, path: string }[]} routes
 */
function httpSchema(routes) {
  return {
    title: 'Thing',
    'x-kind': 'http',
    'x-route': routes,
    type: 'object',
    properties: {},
  };
}

describe('schemaRoutes', () => {
  it('reads the "x-route" entries of an http schema', () => {
    const root = scratchRoot();
    writeSchema(root, 'thing', httpSchema([{ method: 'GET', path: '/things' }]));

    expect(schemaRoutes(root)).toEqual([
      {
        method: 'GET',
        path: '/things',
        schema: 'packages/contracts/schema/http/thing.schema.json',
      },
    ]);
  });

  it('answers several routes for one schema that covers more than one', () => {
    const root = scratchRoot();
    writeSchema(
      root,
      'thing',
      httpSchema([
        { method: 'GET', path: '/things' },
        { method: 'POST', path: '/things' },
      ]),
    );

    expect(schemaRoutes(root).map((route) => `${route.method} ${route.path}`)).toEqual([
      'GET /things',
      'POST /things',
    ]);
  });

  it('skips a schema that is not x-kind "http"', () => {
    const root = scratchRoot();
    writeSchema(root, 'event', {
      title: 'Event',
      'x-kind': 'event',
      'x-route': [{ method: 'GET', path: '/not-http' }],
      type: 'object',
      properties: {},
    });

    expect(schemaRoutes(root)).toEqual([]);
  });

  it('answers nothing for an http schema with no "x-route" at all', () => {
    const root = scratchRoot();
    writeSchema(root, 'thing', {
      title: 'Thing',
      'x-kind': 'http',
      type: 'object',
      properties: {},
    });

    expect(schemaRoutes(root)).toEqual([]);
  });

  it('reads schemas nested under a subdirectory, like engines/claude/', () => {
    const root = scratchRoot();
    fs.mkdirSync(path.join(root, 'packages/contracts/schema/http/engines/claude'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(root, 'packages/contracts/schema/http/engines/claude/account.schema.json'),
      JSON.stringify(httpSchema([{ method: 'GET', path: '/engines/claude/account' }]), null, 2),
    );

    expect(schemaRoutes(root)).toEqual([
      {
        method: 'GET',
        path: '/engines/claude/account',
        schema: 'packages/contracts/schema/http/engines/claude/account.schema.json',
      },
    ]);
  });
});

describe('routeExceptions', () => {
  it('reads the entries of the exceptions file', () => {
    const root = scratchRoot();
    writeExceptions(root, [{ method: 'GET', path: '/health', reason: 'a liveness probe' }]);

    expect(routeExceptions(root)).toEqual([
      { method: 'GET', path: '/health', reason: 'a liveness probe' },
    ]);
  });

  it('answers an empty list for an exceptions file with none', () => {
    const root = scratchRoot();
    writeExceptions(root);

    expect(routeExceptions(root)).toEqual([]);
  });
});

describe('checkRoutes', () => {
  it('reports nothing for a route with a matching schema', () => {
    const root = scratchRoot();
    writeController(
      root,
      'things',
      `@Controller('things')
       export class ThingsController {
         @Get() read() {}
       }`,
    );
    writeSchema(root, 'thing', httpSchema([{ method: 'GET', path: '/things' }]));
    writeExceptions(root);

    expect(checkRoutes(root)).toEqual([]);
  });

  it('fails a route with no schema and no exception', () => {
    const root = scratchRoot();
    writeController(
      root,
      'things',
      `@Controller('things')
       export class ThingsController {
         @Get() read() {}
       }`,
    );
    writeExceptions(root);

    expect(checkRoutes(root)).toEqual([
      {
        kind: 'missingSchema',
        method: 'GET',
        path: '/things',
        detail: expect.stringContaining('registers a route with no schema and no exception'),
      },
    ]);
  });

  it('passes when an exception entry covers the otherwise-unschema’d route', () => {
    const root = scratchRoot();
    writeController(
      root,
      'health',
      `@Controller('health')
       export class HealthController {
         @Get() read() {}
       }`,
    );
    writeExceptions(root, [{ method: 'GET', path: '/health', reason: 'a liveness probe' }]);

    expect(checkRoutes(root)).toEqual([]);
  });

  it('fails an "x-route" that names a route no controller registers', () => {
    const root = scratchRoot();
    writeController(
      root,
      'things',
      `@Controller('things')
       export class ThingsController {
         @Get() read() {}
       }`,
    );
    writeSchema(
      root,
      'thing',
      httpSchema([
        { method: 'GET', path: '/things' },
        { method: 'GET', path: '/things/typo-ed' },
      ]),
    );
    writeExceptions(root);

    expect(checkRoutes(root)).toEqual([
      {
        kind: 'unknownSchemaRoute',
        method: 'GET',
        path: '/things/typo-ed',
        detail: expect.stringContaining('no controller registers'),
      },
    ]);
  });

  it('fails a stale exception — one naming a route no controller registers any more', () => {
    const root = scratchRoot();
    writeController(
      root,
      'things',
      `@Controller('things')
       export class ThingsController {
         @Get() read() {}
       }`,
    );
    writeSchema(root, 'thing', httpSchema([{ method: 'GET', path: '/things' }]));
    writeExceptions(root, [{ method: 'GET', path: '/gone', reason: 'removed long ago' }]);

    expect(checkRoutes(root)).toEqual([
      {
        kind: 'staleException',
        method: 'GET',
        path: '/gone',
        detail: expect.stringContaining('no controller registers'),
      },
    ]);
  });

  it('fails a route named by both a schema and the exceptions file — ambiguous', () => {
    const root = scratchRoot();
    writeController(
      root,
      'things',
      `@Controller('things')
       export class ThingsController {
         @Get() read() {}
       }`,
    );
    writeSchema(root, 'thing', httpSchema([{ method: 'GET', path: '/things' }]));
    writeExceptions(root, [{ method: 'GET', path: '/things', reason: 'mistakenly listed too' }]);

    expect(checkRoutes(root)).toEqual([
      {
        kind: 'ambiguous',
        method: 'GET',
        path: '/things',
        detail: expect.stringContaining('named by both'),
      },
    ]);
  });

  it('reports one problem per unmatched route when several are missing', () => {
    const root = scratchRoot();
    writeController(
      root,
      'things',
      `@Controller('things')
       export class ThingsController {
         @Get() read() {}
         @Post() create() {}
       }`,
    );
    writeExceptions(root);

    expect(
      checkRoutes(root)
        .map((problem) => `${problem.method} ${problem.path}`)
        .sort(),
    ).toEqual(['GET /things', 'POST /things']);
  });

  it('accounts for every real route of this repository — the regression guard', () => {
    const problems = checkRoutes(repoRoot);

    if (problems.length > 0) {
      throw new Error(
        `${String(problems.length)} route(s) disagree with their schema or exception:\n${problems
          .map(
            (problem) => `  ${problem.kind} ${problem.method} ${problem.path} — ${problem.detail}`,
          )
          .join('\n')}`,
      );
    }

    expect(problems).toEqual([]);
  });

  it('the real repository names every route scanHttpRoutes() finds, by schema or by exception', () => {
    const real = new Set(scanHttpRoutes(repoRoot).map((route) => `${route.method} ${route.path}`));
    const named = new Set([
      ...schemaRoutes(repoRoot).map((route) => `${route.method} ${route.path}`),
      ...routeExceptions(repoRoot).map((exception) => `${exception.method} ${exception.path}`),
    ]);

    expect(named).toEqual(real);
  });
});
