import type { SomePort } from '../../application/session/port';

/** A domain file reaching outwards — forbidden by `no-outward-dependency`. */
export type Outward = SomePort;
