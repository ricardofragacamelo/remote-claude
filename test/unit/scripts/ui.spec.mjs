import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The terminal output of every script.
 *
 * It is checked because it is the interface: a script owes output that says **what** failed and
 * **where**, and a gate whose message nobody can read hands the work back to the reader.
 */

const ESC = '';

/** @type {string[]} */
let out = [];
/** @type {string[]} */
let err = [];

/**
 * Imports a fresh copy of the module with the terminal in a given state.
 *
 * `useColor` is decided once, when the module loads, so seeing both branches means loading it
 * twice.
 *
 * @param {{ colour: boolean }} terminal
 */
async function load(terminal) {
  vi.resetModules();
  out = [];
  err = [];

  vi.stubEnv('NO_COLOR', terminal.colour ? undefined : '1');

  Object.defineProperty(process.stdout, 'isTTY', {
    configurable: true,
    get: () => terminal.colour,
  });

  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    out.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    err.push(String(chunk));
    return true;
  });

  return import('../../../scripts/lib/ui.mjs');
}

const realIsTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();

  Object.defineProperty(
    process.stdout,
    'isTTY',
    realIsTTY ?? { configurable: true, value: undefined, writable: true },
  );
});

describe('without colour', () => {
  it('writes plain text, one line at a time', async () => {
    const ui = await load({ colour: false });

    ui.line('hello');
    ui.line();

    expect(out).toEqual(['hello\n', '\n']);
  });

  it('leaves every paint function as a no-op', async () => {
    const ui = await load({ colour: false });

    for (const paint of [ui.bold, ui.dim, ui.red, ui.green, ui.yellow, ui.cyan]) {
      expect(paint('text')).toBe('text');
    }
  });

  it('underlines a title with its own width', async () => {
    const ui = await load({ colour: false });

    ui.title('four');

    expect(out).toEqual(['\n', 'four\n', '────\n']);
  });

  it('marks each outcome with a glyph, and the detail when there is one', async () => {
    const ui = await load({ colour: false });

    ui.ok('passed');
    ui.ok('passed', '1.2s');
    ui.fail('broke');
    ui.fail('broke', 'exit 1');
    ui.warn('careful');
    ui.warn('careful', 'why');
    ui.info('doing something');
    ui.hint('try this instead');

    expect(out).toEqual([
      '✓ passed\n',
      '✓ passed 1.2s\n',
      '✗ broke\n',
      '✗ broke exit 1\n',
      '! careful\n',
      '! careful why\n',
      '· doing something\n',
      '  → try this instead\n',
    ]);
  });

  it('writes a fatal message to the error stream, where a shell expects it', async () => {
    const ui = await load({ colour: false });

    ui.fatal('the tool is not installed');

    expect(err).toEqual(['✗ the tool is not installed\n']);
    expect(out).toEqual([]);
  });
});

describe('with a colour terminal', () => {
  it('wraps the text in the escape sequence, and closes it', async () => {
    const ui = await load({ colour: true });

    expect(ui.bold('x')).toBe(`${ESC}[1mx${ESC}[0m`);
    expect(ui.red('x')).toBe(`${ESC}[31mx${ESC}[0m`);
    expect(ui.green('x')).toBe(`${ESC}[32mx${ESC}[0m`);
    expect(ui.yellow('x')).toBe(`${ESC}[33mx${ESC}[0m`);
    expect(ui.cyan('x')).toBe(`${ESC}[36mx${ESC}[0m`);
    expect(ui.dim('x')).toBe(`${ESC}[2mx${ESC}[0m`);
  });

  it('still writes one line per call', async () => {
    const ui = await load({ colour: true });

    ui.ok('passed');

    expect(out[0]).toContain('passed');
    expect(out[0]).toContain(`${ESC}[32m`);
  });
});
