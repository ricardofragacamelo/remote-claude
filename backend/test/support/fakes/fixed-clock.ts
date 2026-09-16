import type { Clock } from '@domain/shared';

/** A clock that does not move unless the test moves it. */
export class FixedClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  /** Moves the clock forward. */
  advance(milliseconds: number): void {
    this.current = new Date(this.current.getTime() + milliseconds);
  }

  set(instant: Date): void {
    this.current = instant;
  }
}
