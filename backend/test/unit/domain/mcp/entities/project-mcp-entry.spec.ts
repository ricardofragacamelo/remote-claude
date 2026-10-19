import { describe, expect, it } from 'vitest';

import { digestOfProjectMcpEntry } from '@domain/mcp';
import type { ProjectMcpEntry } from '@domain/mcp';

const stdio = (overrides: Partial<ProjectMcpEntry> = {}): ProjectMcpEntry => ({
  name: 'docs',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', 'server'],
  url: null,
  env: [{ name: 'TOKEN', value: '${TOKEN}' }],
  headers: [],
  ...overrides,
});

describe('the digest an approval is keyed on — plan 13, B-24', () => {
  it('is the same for the same entry, asked twice — idempotent by construction', () => {
    expect(digestOfProjectMcpEntry(stdio())).toBe(digestOfProjectMcpEntry(stdio()));
  });

  it('does not change when env or headers are only reordered', () => {
    const forward = stdio({
      env: [
        { name: 'A', value: '1' },
        { name: 'B', value: '2' },
      ],
    });
    const backward = stdio({
      env: [
        { name: 'B', value: '2' },
        { name: 'A', value: '1' },
      ],
    });

    expect(digestOfProjectMcpEntry(forward)).toBe(digestOfProjectMcpEntry(backward));
  });

  it('does not change when only the name changes — the digest is not the lookup key', () => {
    expect(digestOfProjectMcpEntry(stdio({ name: 'docs' }))).toBe(
      digestOfProjectMcpEntry(stdio({ name: 'other' })),
    );
  });

  it('changes when the command changes', () => {
    expect(digestOfProjectMcpEntry(stdio({ command: 'npx' }))).not.toBe(
      digestOfProjectMcpEntry(stdio({ command: 'node' })),
    );
  });

  it('changes when an arg changes', () => {
    expect(digestOfProjectMcpEntry(stdio({ args: ['-y', 'server'] }))).not.toBe(
      digestOfProjectMcpEntry(stdio({ args: ['-y', 'other'] })),
    );
  });

  it('changes when an env value changes, even the literal form of ${VAR}', () => {
    expect(
      digestOfProjectMcpEntry(stdio({ env: [{ name: 'TOKEN', value: '${TOKEN}' }] })),
    ).not.toBe(
      digestOfProjectMcpEntry(stdio({ env: [{ name: 'TOKEN', value: '${OTHER_TOKEN}' }] })),
    );
  });

  it('changes when the transport, url or headers change, for a remote entry', () => {
    const http = stdio({
      transport: 'http',
      command: null,
      args: [],
      url: 'https://example.com/mcp',
      env: [],
      headers: [{ name: 'Authorization', value: 'Bearer ${TOKEN}' }],
    });
    const sse = { ...http, transport: 'sse' as const };
    const otherUrl = { ...http, url: 'https://example.com/other' };
    const otherHeaders = { ...http, headers: [{ name: 'Authorization', value: 'Bearer other' }] };

    expect(digestOfProjectMcpEntry(http)).not.toBe(digestOfProjectMcpEntry(sse));
    expect(digestOfProjectMcpEntry(http)).not.toBe(digestOfProjectMcpEntry(otherUrl));
    expect(digestOfProjectMcpEntry(http)).not.toBe(digestOfProjectMcpEntry(otherHeaders));
  });
});
