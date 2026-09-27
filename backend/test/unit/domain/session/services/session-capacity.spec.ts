import { describe, expect, it } from 'vitest';

import { sessionCapacity } from '@domain/session';
import type { CapacityInputs } from '@domain/session';

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** A 16 GB machine giving half to sessions of 256 MB, between 1 and 10 — the product's default. */
const inputs = (overrides: Partial<CapacityInputs> = {}): CapacityInputs => ({
  memoryBytes: 16 * GB,
  memoryFraction: 0.5,
  perSessionBytes: 256 * MB,
  floor: 1,
  ceiling: 10,
  ...overrides,
});

describe('sessionCapacity — D-01', () => {
  it('allows fewer sessions on a machine with less memory — S-01', () => {
    // 4 GB × 0.5 / 256 MB = 8; 2 GB × 0.5 / 256 MB = 4.
    expect(sessionCapacity(inputs({ memoryBytes: 4 * GB }))).toBe(8);
    expect(sessionCapacity(inputs({ memoryBytes: 2 * GB }))).toBe(4);
  });

  it('never goes past the ceiling, however much memory there is', () => {
    expect(sessionCapacity(inputs({ memoryBytes: 64 * GB }))).toBe(10);
  });

  it('never goes under the floor, however little memory there is', () => {
    expect(sessionCapacity(inputs({ memoryBytes: 256 * MB }))).toBe(1);
    expect(sessionCapacity(inputs({ memoryBytes: 0, floor: 2 }))).toBe(2);
  });

  it('rounds down: a slot that does not fit whole is not a slot', () => {
    // 2.2 GB × 0.5 / 256 MB = 4.4
    expect(sessionCapacity(inputs({ memoryBytes: 2.2 * GB }))).toBe(4);
  });

  it('counts exactly at the boundary — one more byte short is one session fewer', () => {
    const exact = 5 * 2 * 256 * MB;

    expect(sessionCapacity(inputs({ memoryBytes: exact }))).toBe(5);
    expect(sessionCapacity(inputs({ memoryBytes: exact - 1 }))).toBe(4);
  });

  it('gives the sessions a bigger share when the fraction says so', () => {
    expect(sessionCapacity(inputs({ memoryBytes: 2 * GB, memoryFraction: 1 }))).toBe(8);
  });

  it('is a fixed number when floor and ceiling are equal', () => {
    expect(sessionCapacity(inputs({ floor: 3, ceiling: 3, memoryBytes: 64 * GB }))).toBe(3);
    expect(sessionCapacity(inputs({ floor: 3, ceiling: 3, memoryBytes: 0 }))).toBe(3);
  });
});
