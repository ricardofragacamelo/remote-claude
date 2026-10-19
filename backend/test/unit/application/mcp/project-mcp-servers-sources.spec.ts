import { describe, expect, it } from 'vitest';

import { ProjectMcpServersSources } from '@application/mcp';
import { FakeProjectMcpServersSource } from '../../../support/fakes/fake-project-mcp-servers-source';

describe('ProjectMcpServersSources — plan 13, B-24', () => {
  it('answers the reader of an engine it holds one for', () => {
    const source = new FakeProjectMcpServersSource();
    const sources = new ProjectMcpServersSources([{ engine: 'claude', source }]);

    expect(sources.for('claude')).toBe(source);
  });

  it('answers null for an engine it holds no reader for', () => {
    const sources = new ProjectMcpServersSources([]);

    expect(sources.for('codex')).toBeNull();
  });
});
