import { describe, expect, it } from 'vitest';

import {
  agentTemplate,
  commandTemplate,
  outputStyleTemplate,
  skillTemplate,
} from '@/engines/claude/settings/lib/artifact-templates';

describe('artifact templates — plan 13, D-18', () => {
  it('a command template names itself in the frontmatter and the body', () => {
    const content = commandTemplate('review-pr');

    expect(content).toContain('description:');
    expect(content).toContain('/review-pr');
    expect(content).toContain('argument-hint:');
  });

  it('an agent template requires `name:` explicitly — D-102', () => {
    const content = agentTemplate('reviewer');

    expect(content).toMatch(/^---\nname: reviewer\n/);
    expect(content).toContain('description:');
  });

  it('an output style template names itself', () => {
    const content = outputStyleTemplate('concise');

    expect(content).toContain('name: concise');
    expect(content).toContain('description:');
  });

  it('a skill template warns about `!` shell blocks — D-21', () => {
    const content = skillTemplate('review');

    expect(content).toContain('name: review');
    expect(content).toMatch(/runs as shell/);
  });
});
