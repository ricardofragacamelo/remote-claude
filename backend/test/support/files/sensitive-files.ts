import { CLAUDE_CONFIG_FILES } from '@adapter/outbound/engines/claude/security-contract';
import { SensitiveFiles } from '@domain/files';

/**
 * The sensitive files the product wires today: the configuration files the one registered engine
 * declares (plan 28, B-35) — what a write of a spec takes the second step for.
 */
export const PRODUCT_SENSITIVE_FILES = SensitiveFiles.of(CLAUDE_CONFIG_FILES);
