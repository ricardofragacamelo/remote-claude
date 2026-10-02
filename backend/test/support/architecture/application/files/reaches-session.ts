// Deliberate violation: `files` reaching `session`, even through its barrel. Claude's writes reach
// `files` on the internal bus, never by import (plan 07, S-08).
import type { SomePort } from '../session/index';

export type Reached = SomePort;
