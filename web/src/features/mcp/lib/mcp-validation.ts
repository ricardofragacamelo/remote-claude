import type { McpServerFields } from '../types/mcp';

/**
 * The ceilings and patterns of `backend/src/domain/mcp/entities/mcp-server-config.entity.ts`
 * (plan 13, B-18), mirrored here for an inline hint before the request ever leaves the machine. The
 * server is always the final authority: a config this finds nothing wrong with can still come back
 * `422` (a dialect's own refusal, say), and that answer is shown exactly the same way (S-64).
 */
export const MCP_LIMITS = {
  // stdio first, in the order this file validates it — command, then args, then env.
  maxCommandLength: 1024,
  maxArgs: 32,
  maxArgLength: 1024,
  maxEnvVars: 32,
  maxEnvValueLength: 4096,
  // http/sse next — url, then headers.
  maxUrlLength: 2048,
  maxHeaders: 32,
  maxHeaderValueLength: 4096,
} as const;

export const MCP_SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/** One field this screen flags before sending — a translation key, never a literal string. */
export interface FieldIssue {
  readonly field: string;
  readonly messageKey: string;
}

function nameIssue(name: string): FieldIssue | null {
  if (name.trim() === '') {
    return { field: 'name', messageKey: 'agentSettings.mcp.issueNameRequired' };
  }
  if (!MCP_SERVER_NAME_PATTERN.test(name)) {
    return { field: 'name', messageKey: 'agentSettings.mcp.issueNameFormat' };
  }
  if (name.includes('__')) {
    return { field: 'name', messageKey: 'agentSettings.mcp.issueNameDoubleUnderscore' };
  }
  return null;
}

function scopeIssue(fields: McpServerFields): FieldIssue | null {
  if (fields.scope === 'folder' && (fields.folderPath ?? '').trim() === '') {
    return { field: 'folderPath', messageKey: 'agentSettings.mcp.issueFolderRequired' };
  }
  return null;
}

/** The static message keys of one field made of named rows (`env`, `headers`) — never built at
 * runtime: the i18n check only sees a key passed to `t()` as a literal (shared/02-i18n.md). */
interface VariableFieldKeys {
  readonly field: 'env' | 'headers';
  readonly tooMany: string;
  readonly nameFormat: string;
  readonly nameDuplicate: string;
  readonly valueTooLong: string;
}

const ENV_KEYS: VariableFieldKeys = {
  field: 'env',
  tooMany: 'agentSettings.mcp.issueTooManyEnvVars',
  nameFormat: 'agentSettings.mcp.issueEnvNameFormat',
  nameDuplicate: 'agentSettings.mcp.issueEnvNameDuplicate',
  valueTooLong: 'agentSettings.mcp.issueEnvValueTooLong',
};

const HEADER_KEYS: VariableFieldKeys = {
  field: 'headers',
  tooMany: 'agentSettings.mcp.issueTooManyHeaders',
  nameFormat: 'agentSettings.mcp.issueHeaderNameFormat',
  nameDuplicate: 'agentSettings.mcp.issueHeaderNameDuplicate',
  valueTooLong: 'agentSettings.mcp.issueHeaderValueTooLong',
};

/** The count, name and value rules `env` and `headers` share — the keys are theirs, never built. */
function variableFieldIssues(
  keys: VariableFieldKeys,
  rows: readonly { readonly name: string; readonly value?: string | null | undefined }[],
  namePattern: RegExp,
  maxRows: number,
  maxValueLength: number,
  caseSensitiveNames: boolean,
): FieldIssue[] {
  const issues: FieldIssue[] = [];

  if (rows.length > maxRows) {
    issues.push({ field: keys.field, messageKey: keys.tooMany });
  }

  const duplicate = firstDuplicateOrInvalid(rows, namePattern, caseSensitiveNames);
  if (duplicate === 'invalid') {
    issues.push({ field: keys.field, messageKey: keys.nameFormat });
  } else if (duplicate === 'duplicate') {
    issues.push({ field: keys.field, messageKey: keys.nameDuplicate });
  }

  if (rows.some((row) => (row.value ?? '').length > maxValueLength)) {
    issues.push({ field: keys.field, messageKey: keys.valueTooLong });
  }

  return issues;
}

/** The first name that breaks [pattern], or repeats another — whichever comes first. */
function firstDuplicateOrInvalid(
  rows: readonly { readonly name: string }[],
  pattern: RegExp,
  caseSensitive: boolean,
): 'invalid' | 'duplicate' | null {
  const seen = new Set<string>();
  for (const row of rows) {
    if (!pattern.test(row.name)) {
      return 'invalid';
    }
    const key = caseSensitive ? row.name : row.name.toLowerCase();
    if (seen.has(key)) {
      return 'duplicate';
    }
    seen.add(key);
  }
  return null;
}

function stdioIssues(fields: McpServerFields): FieldIssue[] {
  const issues: FieldIssue[] = [];
  const command = (fields.command ?? '').trim();

  if (command === '') {
    issues.push({ field: 'command', messageKey: 'agentSettings.mcp.issueCommandRequired' });
  } else if (command.length > MCP_LIMITS.maxCommandLength) {
    issues.push({ field: 'command', messageKey: 'agentSettings.mcp.issueCommandTooLong' });
  }

  const args = fields.args ?? [];
  if (args.length > MCP_LIMITS.maxArgs) {
    issues.push({ field: 'args', messageKey: 'agentSettings.mcp.issueTooManyArgs' });
  } else if (args.some((arg) => arg.length > MCP_LIMITS.maxArgLength)) {
    issues.push({ field: 'args', messageKey: 'agentSettings.mcp.issueArgTooLong' });
  }

  issues.push(
    ...variableFieldIssues(
      ENV_KEYS,
      fields.env ?? [],
      ENV_NAME_PATTERN,
      MCP_LIMITS.maxEnvVars,
      MCP_LIMITS.maxEnvValueLength,
      true,
    ),
  );

  return issues;
}

function remoteIssues(fields: McpServerFields): FieldIssue[] {
  const issues: FieldIssue[] = [];
  const url = (fields.url ?? '').trim();

  if (url === '') {
    issues.push({ field: 'url', messageKey: 'agentSettings.mcp.issueUrlRequired' });
  } else if (url.length > MCP_LIMITS.maxUrlLength) {
    issues.push({ field: 'url', messageKey: 'agentSettings.mcp.issueUrlTooLong' });
  } else {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        issues.push({ field: 'url', messageKey: 'agentSettings.mcp.issueUrlScheme' });
      }
    } catch {
      issues.push({ field: 'url', messageKey: 'agentSettings.mcp.issueUrlInvalid' });
    }
  }

  issues.push(
    ...variableFieldIssues(
      HEADER_KEYS,
      fields.headers ?? [],
      HEADER_NAME_PATTERN,
      MCP_LIMITS.maxHeaders,
      MCP_LIMITS.maxHeaderValueLength,
      false,
    ),
  );

  return issues;
}

/**
 * Every issue the client can already see, mirroring B-18's domain rules — a hint shown before the
 * request leaves the machine, never a substitute for the server's own refusal (S-64, S-132).
 */
export function mcpFieldIssues(fields: McpServerFields): readonly FieldIssue[] {
  const issues: FieldIssue[] = [];
  const name = nameIssue(fields.name);
  if (name !== null) {
    issues.push(name);
  }
  const scope = scopeIssue(fields);
  if (scope !== null) {
    issues.push(scope);
  }
  issues.push(...(fields.transport === 'stdio' ? stdioIssues(fields) : remoteIssues(fields)));
  return issues;
}
