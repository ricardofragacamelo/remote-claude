import type { Clock } from '@domain/shared';

/** The wall clock. The only place in the backend that reads it. */
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
