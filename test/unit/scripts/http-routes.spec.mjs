import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { routesInFile, scanHttpRoutes } from '../../../scripts/lib/http-routes.mjs';

/**
 * The route table `pnpm contracts:check` cross-references against the schemas (plan 28, B-48) —
 * read straight from the controllers' decorators, because booting the real app to ask Nest costs a
 * database and a realm this gate cannot afford on every save.
 */

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');

/** @type {string[]} */
const temporary = [];

afterEach(() => {
  for (const dir of temporary.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * One controller file, written to a scratch directory, read back as routes.
 *
 * @param {string} content
 */
function routesOf(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-http-routes-'));
  temporary.push(dir);
  const file = path.join(dir, 'fixture.controller.ts');
  fs.writeFileSync(file, content);
  return routesInFile(file, 'fixture.controller.ts');
}

describe('routesInFile', () => {
  it('joins the controller’s own prefix and a method’s own path', () => {
    const routes = routesOf(`
      @Controller('files')
      export class FilesController {
        @Get('tree') tree() {}
        @Post() create() {}
      }
    `);

    expect(routes).toEqual([
      { method: 'GET', path: '/files/tree', file: 'fixture.controller.ts' },
      { method: 'POST', path: '/files', file: 'fixture.controller.ts' },
    ]);
  });

  it('answers at the root for a controller with no prefix of its own, and a method with none', () => {
    const routes = routesOf(`
      @Controller()
      export class ClaudeController {
        @Get('engines/claude/account') account() {}
      }
    `);

    expect(routes).toEqual([
      { method: 'GET', path: '/engines/claude/account', file: 'fixture.controller.ts' },
    ]);
  });

  it('keeps a path parameter of the controller’s own prefix', () => {
    const routes = routesOf(`
      @Controller('sessions/:sessionId')
      export class SessionInsightController {
        @Get('context') context() {}
      }
    `);

    expect(routes).toEqual([
      { method: 'GET', path: '/sessions/:sessionId/context', file: 'fixture.controller.ts' },
    ]);
  });

  it('answers once per path of an array route — the same handler under more than one alias', () => {
    const routes = routesOf(`
      @Controller()
      export class ClaudeController {
        @Get(['engines/claude/account', 'claude/account']) account() {}
      }
    `);

    expect(routes).toEqual([
      { method: 'GET', path: '/engines/claude/account', file: 'fixture.controller.ts' },
      { method: 'GET', path: '/claude/account', file: 'fixture.controller.ts' },
    ]);
  });

  it('answers every method a controller declares — Get, Post, Put, Patch, Delete', () => {
    const routes = routesOf(`
      @Controller('things')
      export class ThingsController {
        @Get(':id') read() {}
        @Post() create() {}
        @Put(':id') replace() {}
        @Patch(':id') update() {}
        @Delete(':id') remove() {}
      }
    `);

    expect(routes.map((route) => route.method)).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
  });

  it('answers nothing for a file that declares no controller — a DTO, a service', () => {
    expect(routesOf(`export interface ThingDto { readonly id: string; }`)).toEqual([]);
  });

  it('skips a decorator call that never closes, rather than reading past the end of the file', () => {
    const routes = routesOf(`
      @Controller('things')
      export class ThingsController {
        @Get('tree'
      }
    `);

    expect(routes).toEqual([]);
  });

  it('answers at the root when the controller’s own call never closes, rather than guessing a prefix', () => {
    const routes = routesOf(`
      @Controller('things'
      export class ThingsController {
        @Get('tree') tree() {}
      }
    `);

    expect(routes).toEqual([{ method: 'GET', path: '/tree', file: 'fixture.controller.ts' }]);
  });

  it('reads a double-quoted path the same as a single-quoted one', () => {
    const routes = routesOf(`
      @Controller("things")
      export class ThingsController {
        @Get("tree") tree() {}
      }
    `);

    expect(routes).toEqual([
      { method: 'GET', path: '/things/tree', file: 'fixture.controller.ts' },
    ]);
  });

  it('answers at the root when the controller’s own argument is not a literal at all', () => {
    const routes = routesOf(`
      @Controller(PREFIX)
      export class ThingsController {
        @Get('tree') tree() {}
      }
    `);

    expect(routes).toEqual([{ method: 'GET', path: '/tree', file: 'fixture.controller.ts' }]);
  });

  it('refuses an array route with one item that is not a literal, as if none of it were', () => {
    const routes = routesOf(`
      @Controller('things')
      export class ThingsController {
        @Get(['one', SOME_VARIABLE]) mixed() {}
      }
    `);

    expect(routes).toEqual([]);
  });

  it('is not confused by a nested call inside the decorator’s own arguments', () => {
    const routes = routesOf(`
      @Controller('things')
      export class ThingsController {
        @UseGuards(SomeGuard)
        @Get(someHelper('a', 'b'))
        read() {}
      }
    `);

    // Not a string literal path, so nothing useful comes out of it — but the parser must still
    // find the call's real closing paren rather than the one inside \`someHelper(...)\`, or every
    // decorator after this one in the same file would be read from the wrong place.
    expect(routes).toEqual([]);
  });

  it('reads the route after a decorator whose own argument has a nested call, unharmed', () => {
    const routes = routesOf(`
      @Controller('things')
      export class ThingsController {
        @Get(someHelper('a', 'b'))
        broken() {}

        @Get('fine')
        fine() {}
      }
    `);

    expect(routes).toEqual([
      { method: 'GET', path: '/things/fine', file: 'fixture.controller.ts' },
    ]);
  });
});

describe('scanHttpRoutes', () => {
  it('finds routes the real backend declares, from more than one controller', () => {
    const routes = scanHttpRoutes(repoRoot);

    expect(routes).toContainEqual({
      method: 'GET',
      path: '/engines',
      file: 'backend/src/adapter/inbound/http/engines/engines.controller.ts',
    });
    expect(routes).toContainEqual({
      method: 'GET',
      path: '/health',
      file: 'backend/src/adapter/inbound/http/health/health.controller.ts',
    });
  });

  it('answers a single route once, with no alias left from the window of the previous protocol', () => {
    const routes = scanHttpRoutes(repoRoot);
    const account = routes.filter(
      (route) => route.method === 'GET' && route.path.endsWith('account'),
    );

    expect(account.map((route) => route.path)).toEqual(['/engines/claude/account']);
  });

  it('sorts by path then method, the same order whatever the filesystem returns', () => {
    const routes = scanHttpRoutes(repoRoot);
    const sorted = [...routes].sort(
      (left, right) =>
        left.path.localeCompare(right.path) || left.method.localeCompare(right.method),
    );

    expect(routes).toEqual(sorted);
  });

  it('answers nothing for a directory with no controller at all', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-http-routes-empty-'));
    temporary.push(dir);
    fs.mkdirSync(path.join(dir, 'backend/src/adapter/inbound/http'), { recursive: true });

    expect(scanHttpRoutes(dir)).toEqual([]);
  });
});
