import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BATCH_SIZE,
  LogBuffer,
  beaconShipper,
  createLogger,
  defaultLevel,
} from '@/shared/logging/logger';
import type { LogShipper } from '@/shared/logging/logger';

/** A shipper that keeps the batches it was handed. */
function recordingShipper(): LogShipper & { batches: readonly unknown[][] } {
  const batches: unknown[][] = [];
  return { batches, send: (lines) => batches.push([...lines]) };
}

describe('defaultLevel', () => {
  it.each([
    ['test', true, 'silent'],
    ['test', false, 'silent'],
    ['development', true, 'debug'],
    ['production', false, 'info'],
  ])('is %s/%s → %s', (mode, isDevelopment, expected) => {
    expect(defaultLevel(mode, isDevelopment)).toBe(expected);
  });
});

describe('createLogger', () => {
  it('stamps the service and the build on every line', () => {
    const lines: Record<string, unknown>[] = [];
    const log = createLogger(
      { level: 'debug', appVersion: '1.2.3' },
      { write: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) },
    );

    log.info({ op: 'test' }, 'something happened');

    expect(lines[0]).toMatchObject({ service: 'web', appVersion: '1.2.3', op: 'test' });
  });

  it('writes the level as its name', () => {
    const lines: Record<string, unknown>[] = [];
    const log = createLogger(
      { level: 'debug', appVersion: '1' },
      { write: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) },
    );

    log.warn({ op: 'test' }, 'careful');

    expect(lines[0]?.['level']).toBe('warn');
  });

  it('can be built without a destination', () => {
    expect(createLogger({ level: 'silent', appVersion: '1' }).level).toBe('silent');
  });
});

describe('LogBuffer', () => {
  let shipper: ReturnType<typeof recordingShipper>;

  beforeEach(() => {
    shipper = recordingShipper();
  });

  const line = (level = 'info'): string => JSON.stringify({ level, msg: 'x' });

  it('holds lines until there are enough of them', () => {
    const buffer = new LogBuffer(shipper, 3);

    buffer.accept(line());
    buffer.accept(line());

    expect(shipper.batches).toEqual([]);
    expect(buffer.pending).toBe(2);
  });

  it('ships as soon as the batch is full', () => {
    const buffer = new LogBuffer(shipper, 3);

    buffer.accept(line());
    buffer.accept(line());
    buffer.accept(line());

    expect(shipper.batches).toHaveLength(1);
    expect(buffer.pending).toBe(0);
  });

  it.each(['error', 'fatal'])('ships a %s line immediately', (level) => {
    const buffer = new LogBuffer(shipper, BATCH_SIZE);

    buffer.accept(line(level));

    expect(shipper.batches).toHaveLength(1);
  });

  it('ships on the interval', () => {
    vi.useFakeTimers();
    const buffer = new LogBuffer(shipper, BATCH_SIZE);
    buffer.start(1_000);

    buffer.accept(line());
    vi.advanceTimersByTime(1_000);

    expect(shipper.batches).toHaveLength(1);
    buffer.stop();
    vi.useRealTimers();
  });

  it('starting twice keeps one interval', () => {
    vi.useFakeTimers();
    const buffer = new LogBuffer(shipper, BATCH_SIZE);

    buffer.start(1_000);
    buffer.start(1_000);
    buffer.accept(line());
    vi.advanceTimersByTime(1_000);

    expect(shipper.batches).toHaveLength(1);
    buffer.stop();
    vi.useRealTimers();
  });

  it('stopping is safe even when it never started', () => {
    expect(() => new LogBuffer(shipper).stop()).not.toThrow();
  });

  it('ships nothing when there is nothing to ship', () => {
    new LogBuffer(shipper).flush();

    expect(shipper.batches).toEqual([]);
  });

  it('drops a line that will not parse rather than taking the page down', () => {
    const buffer = new LogBuffer(shipper, 1);

    expect(() => buffer.accept('{not json')).not.toThrow();
    expect(shipper.batches).toEqual([]);
  });

  it('a failed shipment never reaches the application', () => {
    const failing: LogShipper = {
      send: () => {
        throw new Error('network down');
      },
    };
    const buffer = new LogBuffer(failing, 1);

    expect(() => buffer.accept(line())).not.toThrow();
    expect(buffer.pending).toBe(0);
  });
});

describe('beaconShipper', () => {
  it('prefers the transport that survives the page unloading', () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { sendBeacon });

    beaconShipper('/logs').send([{ msg: 'x' }]);

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon.mock.calls[0]?.[0]).toBe('/logs');
    vi.unstubAllGlobals();
  });

  it('falls back to a keepalive request where there is no beacon', () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('navigator', { sendBeacon: undefined });
    vi.stubGlobal('fetch', fetchMock);

    beaconShipper('/logs').send([{ msg: 'x' }]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).keepalive).toBe(true);
    vi.unstubAllGlobals();
  });

  it('a failed fallback is swallowed, never rethrown at the page', () => {
    vi.stubGlobal('navigator', { sendBeacon: undefined });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    expect(() => beaconShipper('/logs').send([{ msg: 'x' }])).not.toThrow();
    vi.unstubAllGlobals();
  });
});
