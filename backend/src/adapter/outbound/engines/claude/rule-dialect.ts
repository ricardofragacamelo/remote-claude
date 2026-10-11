import type { RuleDialect, RuleTranslation } from '@application/permission';
import { readRulePattern } from '@domain/permission';
import { CLAUDE_ENGINE } from './claude-engine';

/** `Tool` or `Tool(...)` of the Claude Code settings, the tool name an identifier. */
const NATIVE = /^([A-Za-z][A-Za-z0-9_]*)(?:\((.*)\))?$/s;

/** `mcp__server__tool` and `mcp__server`, as Claude Code names an MCP tool and its server. */
const MCP_TOOL = /^mcp__(.+?)__(.+)$/;
const MCP_SERVER = /^mcp__(.+)$/;

/** The canonical kind of each tool whose rules translate by path, and the one bare form each has. */
const PATH_TOOLS: Readonly<Record<string, string>> = {
  Read: 'file.read',
  NotebookRead: 'file.read',
  Edit: 'file.edit',
  MultiEdit: 'file.edit',
  NotebookEdit: 'file.edit',
  Write: 'file.write',
  Glob: 'search',
  Grep: 'search',
};

/** The tools whose rules translate only bare: every call, or no translation. */
const BARE_TOOLS: Readonly<Record<string, string>> = {
  WebSearch: 'web.search',
  Task: 'agent',
  Agent: 'agent',
};

/** The names the shell tool goes by in the settings and the hooks. */
const SHELL_TOOLS: ReadonlySet<string> = new Set(['Bash', 'BashTool']);

function untranslatable(reason: string): RuleTranslation {
  return { untranslatable: reason };
}

/**
 * An absolute path a canonical exact matcher reads as the old one did — no glob, no `.` or `..`, no
 * repeated or trailing slash, so normalising it changes nothing — or why it cannot be one.
 */
function pathProblem(content: string): string | null {
  if (content.endsWith(':*')) {
    // The settings' prefix on a path reached past a space: no glob says that.
    return 'prefixPath';
  }

  if (!content.startsWith('/')) {
    // Relative to what the CLI ran in, which the rule never said.
    return 'relativePath';
  }

  if (content.includes('*')) {
    return 'globPath';
  }

  const segments = content.slice(1).split('/');

  return segments.some((segment) => segment === '' || segment === '.' || segment === '..')
    ? 'unnormalizedPath'
    : null;
}

/** A pattern of a tool that translates by path. */
function byPath(kind: string, content: string | undefined): RuleTranslation {
  if (content === undefined) {
    return { pattern: kind };
  }

  const problem = pathProblem(content);

  return problem === null ? { pattern: `${kind}(${content})` } : untranslatable(problem);
}

/** A `WebFetch` pattern: bare, or of a domain — an exact URL has no domain that would not widen it. */
function webFetch(content: string | undefined): RuleTranslation {
  if (content === undefined) {
    return { pattern: 'web.fetch' };
  }

  return content.startsWith('domain:')
    ? { pattern: `web.fetch(${content})` }
    : untranslatable('exactUrl');
}

/** An MCP tool or server, named the way Claude Code names them — with no matcher of its own. */
function mcp(name: string, content: string | undefined): RuleTranslation | null {
  const tool = MCP_TOOL.exec(name);
  const server = MCP_SERVER.exec(name);

  if (server === null) {
    return null;
  }

  if (content !== undefined) {
    return untranslatable('matcherNotSupported');
  }

  return {
    pattern:
      tool === null ? `mcp(${String(server[1])}:*)` : `mcp(${String(tool[1])}:${String(tool[2])})`,
  };
}

/** The canonical pattern a native one means, before it is checked to read back. */
function translateNative(name: string, content: string | undefined): RuleTranslation {
  const ofMcp = mcp(name, content);

  if (ofMcp !== null) {
    return ofMcp;
  }

  if (SHELL_TOOLS.has(name)) {
    // A whole shell is Permitir tudo by another name: never a reach, so never a translation.
    return content === undefined ? untranslatable('wholeShell') : { pattern: `shell(${content})` };
  }

  const pathKind = PATH_TOOLS[name];
  if (pathKind !== undefined) {
    return byPath(pathKind, content);
  }

  if (name === 'WebFetch') {
    return webFetch(content);
  }

  const bareKind = BARE_TOOLS[name];
  if (bareKind !== undefined) {
    return content === undefined ? { pattern: bareKind } : untranslatable('matcherNotSupported');
  }

  // A question, a plan, the task list, a command's output, and any name the core has no rule kind
  // for: none of them takes a rule.
  return untranslatable('noCanonicalKind');
}

/**
 * The rule grammar of Claude Code — the settings' `Bash(git status:*)` — translated into the
 * canonical one, for the rules written before it (plan 28, B-31, B-33, D-18).
 *
 * Only what is **unambiguous** translates: a translated rule covers the calls the old one covered
 * (S-91). Everything else is untranslatable, with a code, and the migration switches that rule off:
 *
 * | Claude Code | Canonical |
 * |---|---|
 * | `Bash(x)`, `Bash(x:*)` | `shell(x)`, `shell(x:*)` — a bare `Bash` is untranslatable |
 * | `Read`, `NotebookRead` / with an absolute path | `file.read` / `file.read(<path>)` |
 * | `Edit`, `MultiEdit`, `NotebookEdit` / with an absolute path | `file.edit` / `file.edit(<path>)` |
 * | `Write` / with an absolute path | `file.write` / `file.write(<path>)` |
 * | `WebFetch` / `WebFetch(domain:h)` | `web.fetch` / `web.fetch(domain:h)` — a URL is not |
 * | `WebSearch` | `web.search` |
 * | `Glob`, `Grep` / with an absolute path | `search` / `search(<path>)` |
 * | `Task`, `Agent` | `agent` |
 * | `mcp__s__t`, `mcp__s` | `mcp(s:t)`, `mcp(s:*)` |
 *
 * Nothing goes the other way: no rule is ever sent to the SDK, and its suggestions are not read.
 */
export const claudeRuleDialect: RuleDialect = {
  engine: CLAUDE_ENGINE,

  translate(nativePattern: string): RuleTranslation {
    const match = NATIVE.exec(nativePattern.trim());
    const name = match?.[1];

    if (match === null || name === undefined) {
      return untranslatable('notPattern');
    }

    const content = match[2];

    if (content === '') {
      return untranslatable('emptyMatcher');
    }

    const translation = translateNative(name, content);

    // What does not read back in the canonical grammar — a `)` inside, an unusable host — is not a
    // translation at all.
    return 'pattern' in translation && readRulePattern(translation.pattern) === null
      ? untranslatable('notCanonical')
      : translation;
  },
};
