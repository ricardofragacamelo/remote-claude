// Deliberate violation: the engine settings reaching `session`, even through its barrel. The session
// asks them through a port of its own, and the live sessions come through the registry module
// (plan 28, B-36).
import type { SomePort } from '../session/index';

export type Reached = SomePort;
