// Deliberate violation: the engine settings importing the Agent SDK outside
// `adapter/outbound/engines/claude/`. The probe and the model check live there; the module only
// declares the ports (plan 28, B-36).
import type { Query } from '@anthropic-ai/claude-agent-sdk';

export type Talked = Query;
