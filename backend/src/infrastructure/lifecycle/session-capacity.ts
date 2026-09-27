import { totalmem } from 'node:os';

import { SessionRegistry } from '@application/session';
import { sessionCapacity } from '@domain/session';
import type { Clock } from '@domain/shared';
import type { Logger } from '@shared/logging/logger';
import type { AppConfig } from '../config/environment';

/**
 * The RAM this process may use: the machine's, or the container's limit when it is smaller.
 *
 * `constrainedMemory()` is the cgroup limit, `0` when there is none, and a number larger than the
 * machine when the limit is "unlimited" — so the smaller of the two is the one that is true.
 *
 * @param total the machine's RAM; a parameter so a test does not depend on the box it runs on
 * @param constrained the container's limit, `0` for none
 */
export function machineMemoryBytes(
  total: number = totalmem(),
  constrained: number = process.constrainedMemory(),
): number {
  return constrained > 0 ? Math.min(total, constrained) : total;
}

/**
 * The registry of live sessions, with the capacity this machine was found to have.
 *
 * Read once, at boot, and said out loud: an operator wondering why the eleventh session was
 * refused on one machine and the fourth on another finds the answer on the first line that
 * mentions sessions ([D-01](../../../../docs/plans/05-hardening-operations/decisions.md)).
 */
export function sessionRegistryFor(
  config: Pick<AppConfig, 'session'>,
  memoryBytes: number,
  clock: Clock,
  logger: Logger,
): SessionRegistry {
  const { capacity } = config.session;
  const limit = sessionCapacity({ memoryBytes, ...capacity });

  logger.info(
    {
      op: 'session.capacity',
      layer: 'infrastructure',
      module: 'session',
      limit,
      memoryBytes,
      memoryFraction: capacity.memoryFraction,
      perSessionBytes: capacity.perSessionBytes,
      floor: capacity.floor,
      ceiling: capacity.ceiling,
    },
    'session capacity derived from the machine memory',
  );

  return new SessionRegistry(limit, clock);
}

/** DI token of the RAM the capacity is derived from — replaced by a suite that needs a small box. */
export const MACHINE_MEMORY = Symbol('MachineMemory');
