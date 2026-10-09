#!/usr/bin/env node
/**
 * The MCP server the spike, the e2e and the smoke-live run — ours, minimal, and offline
 * ([plan 13 · D-19](../../../docs/plans/13-claude-settings/decisions.md#d-19--servidor-mcp-de-fixture)).
 *
 * A public package (`npx @modelcontextprotocol/server-everything`) would download code from the
 * network on every run and change without notice — the opposite of what a test needs. This one is
 * stdio, has no dependency besides `@modelcontextprotocol/sdk` (declared by `e2e/package.json`),
 * and never opens a socket.
 *
 * Four tools, each there for a claim:
 *
 * - `echo` — declares no annotation: the product reads it as destructive (plan 13, D-13);
 * - `peek` — declares `readOnlyHint`: the annotation is the server's own text, and it must not
 *   lower the risk the product shows;
 * - `secret` — answers whether the variable `--secret-variable` names reached the process, **masked**:
 *   its length and the first 12 hex characters of its sha256. It is how a test proves a secret
 *   arrived without the value ever appearing in a response, a log or a screen;
 * - `env_names` — the **names** of the variables the process sees, sorted, never a value: what the
 *   spike measures about the environment a server inherits from the CLI (S-05), and what the
 *   integration proves the backend's configuration no longer reaches (S-81).
 *
 * Configured by its arguments, the way an MCP configuration configures any server:
 *
 *   node fixture-mcp-server.mjs [--name <name>] [--started <file>] [--secret-variable <VAR>]
 *
 * `--name` is the name it reports (`fixture` by default); `--started` is a file it creates when it
 * starts — how the spike sees a server it must not start come up at all; `--secret-variable` is the
 * variable the `secret` tool reads, which the test that registers the server puts in its `env`.
 */

import fs from 'node:fs';
import process from 'node:process';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { maskedSecret } from './masked-secret.mjs';

/** The value after a flag of the command line, or `null`. @param {string} flag */
function argument(flag) {
  const at = process.argv.indexOf(flag);
  return at === -1 ? null : (process.argv[at + 1] ?? null);
}

const NAME = argument('--name') ?? 'fixture';
const SECRET_VARIABLE = argument('--secret-variable');

const STARTED = argument('--started');
if (STARTED !== null) {
  fs.writeFileSync(STARTED, `${NAME}\n`);
}

/** @type {readonly { name: string, description: string, inputSchema: object, annotations?: object }[]} */
const TOOLS = [
  {
    name: 'echo',
    description: 'Returns the text it was given.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
  },
  {
    name: 'peek',
    description: 'Returns a fixed sentence. Declares itself read-only.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'secret',
    description: 'Says whether the secret variable is set, masked: its length and a hash prefix.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'env_names',
    description: 'Lists the names, never the values, of the environment variables it sees.',
    inputSchema: { type: 'object', properties: {} },
  },
];

/** @param {string} tool @param {Record<string, unknown>} args */
function answer(tool, args) {
  switch (tool) {
    case 'echo':
      return String(args['text'] ?? '');
    case 'peek':
      return 'the fixture server is reachable';
    case 'secret':
      return maskedSecret(SECRET_VARIABLE === null ? undefined : process.env[SECRET_VARIABLE]);
    case 'env_names':
      return Object.keys(process.env).sort().join('\n');
    default:
      return null;
  }
}

const server = new Server({ name: NAME, version: '1.0.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, (request) => {
  const text = answer(request.params.name, request.params.arguments ?? {});
  return text === null
    ? { isError: true, content: [{ type: 'text', text: `unknown tool ${request.params.name}` }] }
    : { content: [{ type: 'text', text }] };
});

await server.connect(new StdioServerTransport());
