// Deliberate violation: `claude-config` reaching `session`, even through its barrel. The session asks
// it through a port of its own, and the live sessions come through the registry module (plan 13, S-14).
import type { SomePort } from '../session/index';

export type Reached = SomePort;
