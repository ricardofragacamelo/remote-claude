import { describe, expect, it } from 'vitest';

import { claudeRuleDialect } from '@adapter/outbound/engines/claude/rule-dialect';
import { readRulePattern } from '@domain/permission';

/**
 * The rule grammar of Claude Code, translated into the canonical one — plan 28, B-31, B-33, D-18.
 * Every row of the translation table, and every way a pattern is left untranslatable.
 */
describe('claudeRuleDialect', () => {
  it('is the dialect of the engine claude', () => {
    expect(claudeRuleDialect.engine).toBe('claude');
  });

  it.each([
    ['Bash(git status)', 'shell(git status)'],
    ['Bash(git status:*)', 'shell(git status:*)'],
    ['BashTool(npm test:*)', 'shell(npm test:*)'],
    ['Bash(make && make test)', 'shell(make && make test)'],
    ['Read', 'file.read'],
    ['NotebookRead', 'file.read'],
    ['Read(/etc/hosts)', 'file.read(/etc/hosts)'],
    ['NotebookRead(/srv/a.ipynb)', 'file.read(/srv/a.ipynb)'],
    ['Edit', 'file.edit'],
    ['MultiEdit', 'file.edit'],
    ['NotebookEdit', 'file.edit'],
    ['Edit(/srv/projects/app/a.ts)', 'file.edit(/srv/projects/app/a.ts)'],
    ['MultiEdit(/srv/a.ts)', 'file.edit(/srv/a.ts)'],
    ['NotebookEdit(/srv/a.ipynb)', 'file.edit(/srv/a.ipynb)'],
    ['Write', 'file.write'],
    ['Write(/srv/b.ts)', 'file.write(/srv/b.ts)'],
    ['WebFetch', 'web.fetch'],
    ['WebFetch(domain:example.com)', 'web.fetch(domain:example.com)'],
    ['WebSearch', 'web.search'],
    ['Glob', 'search'],
    ['Grep', 'search'],
    ['Grep(/srv/projects/app/src)', 'search(/srv/projects/app/src)'],
    ['Glob(/srv)', 'search(/srv)'],
    ['Task', 'agent'],
    ['Agent', 'agent'],
    ['mcp__github__create_issue', 'mcp(github:create_issue)'],
    ['mcp__github', 'mcp(github:*)'],
    ['mcp__product_dock__list_work_items', 'mcp(product_dock:list_work_items)'],
    ['  Bash(ls)  ', 'shell(ls)'],
  ])('translates %j into %j — S-133', (native, canonical) => {
    expect(claudeRuleDialect.translate(native)).toEqual({ pattern: canonical });
    expect(readRulePattern(canonical)).not.toBeNull();
  });

  it.each([
    ['Bash', 'wholeShell', 'a whole shell is never a reach'],
    ['BashTool', 'wholeShell', 'nor by its other name'],
    [
      'Read(src/a.ts)',
      'relativePath',
      'relative to what the CLI ran in, which the rule never said',
    ],
    ['Edit(/srv/*.ts)', 'globPath', 'a glob of the settings is not ours'],
    ['Write(/srv/a:*)', 'prefixPath', 'a prefix on a path reached past a space'],
    ['Read(/srv/../etc)', 'unnormalizedPath', 'normalising it would change it'],
    ['Read(/srv/./a)', 'unnormalizedPath', 'a dot segment'],
    ['Read(/srv//a)', 'unnormalizedPath', 'a repeated slash'],
    ['Read(/srv/a/)', 'unnormalizedPath', 'a trailing slash'],
    ['Grep(TODO)', 'relativePath', 'the old matcher may have been the pattern, not the path'],
    ['WebFetch(https://example.com/a)', 'exactUrl', 'a domain would widen an exact URL'],
    ['WebSearch(vitest)', 'matcherNotSupported', 'a web search takes no matcher'],
    ['Task(explore)', 'matcherNotSupported', 'a subagent takes no matcher'],
    ['Agent(x)', 'matcherNotSupported', 'nor by its other name'],
    ['mcp__github__create_issue(x)', 'matcherNotSupported', 'an MCP tool takes no matcher'],
    ['AskUserQuestion', 'noCanonicalKind', 'a question takes no rule'],
    ['ExitPlanMode', 'noCanonicalKind', 'a plan takes no rule'],
    ['TodoWrite', 'noCanonicalKind', 'the task list takes no rule'],
    ['TaskCreate', 'noCanonicalKind', 'nor its tools'],
    ['BashOutput', 'noCanonicalKind', "a command's output takes no rule"],
    ['KillShell', 'noCanonicalKind', 'nor stopping one'],
    ['LS', 'noCanonicalKind', 'a listing has no canonical kind'],
    ['Skill', 'noCanonicalKind', 'a skill neither'],
    ['SlashCommand', 'noCanonicalKind', 'a slash command neither'],
    ['SomethingNew', 'noCanonicalKind', 'any other name'],
    ['Bash()', 'emptyMatcher', 'a pattern somebody meant to fill in'],
    ['Bash(echo (x))', 'notCanonical', 'a `)` inside does not read back'],
    ['WebFetch(domain:a b)', 'notCanonical', 'a host the canonical grammar does not read'],
    ['Bash(:*)', 'notCanonical', 'a prefix of nothing'],
    ['', 'notPattern', 'nothing'],
    ['9Bash(x)', 'notPattern', 'not a tool name'],
    ['Bash(x', 'notPattern', 'a parenthesis left open'],
  ])('leaves %j untranslatable (%s) — %s', (native, reason) => {
    expect(claudeRuleDialect.translate(native)).toEqual({ untranslatable: reason });
  });
});
