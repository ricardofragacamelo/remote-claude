// Deliberate violation: `claude-config` importing the Agent SDK outside `adapter/outbound/claude/`.
// The probe and the model check live there; the module only declares the ports (plan 13, S-14).
import type { Query } from '@anthropic-ai/claude-agent-sdk';

export type Talked = Query;
