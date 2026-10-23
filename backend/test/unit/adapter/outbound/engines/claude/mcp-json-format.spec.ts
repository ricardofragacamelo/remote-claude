import { describe, expect, it } from 'vitest';

import {
  mcpJsonEntriesOf,
  mcpServerMapEntriesOf,
} from '@adapter/outbound/engines/claude/mcp-json-format';

describe('mcpServerMapEntriesOf — shared .mcp.json map parser (plan 13, B-24, B-27)', () => {
  it('parses a stdio entry with args and env', () => {
    expect(
      mcpServerMapEntriesOf({
        docs: { command: 'npx', args: ['-y', 'server'], env: { TOKEN: '${TOKEN}' } },
      }),
    ).toEqual([
      {
        name: 'docs',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', 'server'],
        url: null,
        env: [{ name: 'TOKEN', value: '${TOKEN}' }],
        headers: [],
      },
    ]);
  });

  it('parses a minimal stdio entry with no args or env', () => {
    expect(mcpServerMapEntriesOf({ docs: { command: 'npx' } })).toEqual([
      {
        name: 'docs',
        transport: 'stdio',
        command: 'npx',
        args: [],
        url: null,
        env: [],
        headers: [],
      },
    ]);
  });

  it('parses an http entry with headers', () => {
    expect(
      mcpServerMapEntriesOf({
        remote: {
          type: 'http',
          url: 'https://mcp.example.com',
          headers: { Authorization: 'Bearer x' },
        },
      }),
    ).toEqual([
      {
        name: 'remote',
        transport: 'http',
        command: null,
        args: [],
        url: 'https://mcp.example.com',
        env: [],
        headers: [{ name: 'Authorization', value: 'Bearer x' }],
      },
    ]);
  });

  it('parses an sse entry', () => {
    expect(
      mcpServerMapEntriesOf({ remote: { type: 'sse', url: 'https://mcp.example.com' } }),
    ).toEqual([
      {
        name: 'remote',
        transport: 'sse',
        command: null,
        args: [],
        url: 'https://mcp.example.com',
        env: [],
        headers: [],
      },
    ]);
  });

  it('is null when the value is not an object', () => {
    expect(mcpServerMapEntriesOf([])).toBeNull();
    expect(mcpServerMapEntriesOf('nope')).toBeNull();
    expect(mcpServerMapEntriesOf(null)).toBeNull();
  });

  it('is null when an entry has an unknown type', () => {
    expect(mcpServerMapEntriesOf({ docs: { type: 'carrier-pigeon' } })).toBeNull();
  });

  it('is null when a stdio entry has no command', () => {
    expect(mcpServerMapEntriesOf({ docs: {} })).toBeNull();
  });

  it('is null when args is not an array of strings', () => {
    expect(mcpServerMapEntriesOf({ docs: { command: 'npx', args: [1, 2] } })).toBeNull();
    expect(mcpServerMapEntriesOf({ docs: { command: 'npx', args: 'nope' } })).toBeNull();
  });

  it('is null when env or headers values are not strings', () => {
    expect(mcpServerMapEntriesOf({ docs: { command: 'npx', env: { X: 1 } } })).toBeNull();
    expect(
      mcpServerMapEntriesOf({ remote: { type: 'http', url: 'https://x', headers: { X: 1 } } }),
    ).toBeNull();
  });

  it('is null when a remote entry has no url, or headers is not an object', () => {
    expect(mcpServerMapEntriesOf({ remote: { type: 'http' } })).toBeNull();
    expect(
      mcpServerMapEntriesOf({ remote: { type: 'http', url: 'https://x', headers: [] } }),
    ).toBeNull();
  });

  it('is empty for an empty map', () => {
    expect(mcpServerMapEntriesOf({})).toEqual([]);
  });
});

describe('mcpJsonEntriesOf — the mcpServers field of a parsed .mcp.json document', () => {
  it('reads the mcpServers map of the document', () => {
    expect(mcpJsonEntriesOf({ mcpServers: { docs: { command: 'npx' } } })).toEqual([
      {
        name: 'docs',
        transport: 'stdio',
        command: 'npx',
        args: [],
        url: null,
        env: [],
        headers: [],
      },
    ]);
  });

  it('is null when the document is not an object', () => {
    expect(mcpJsonEntriesOf([])).toBeNull();
    expect(mcpJsonEntriesOf('nope')).toBeNull();
  });

  it('is null when there is no mcpServers field at all', () => {
    expect(mcpJsonEntriesOf({ somethingElse: true })).toBeNull();
  });
});
