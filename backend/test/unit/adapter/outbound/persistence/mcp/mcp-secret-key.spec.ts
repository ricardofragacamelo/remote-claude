import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  UnusableMcpSecretKeyError,
  readMcpSecretKey,
} from '@adapter/outbound/persistence/mcp/mcp-secret-key';

function write(contents: string): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'rc-mcp-key-')), 'key');
  writeFileSync(file, contents, 'utf8');
  return file;
}

describe('reading the MCP secret key — plan 13, D-02', () => {
  it('reads a valid base64-encoded 32-byte key', async () => {
    const key = randomBytes(32);
    const read = await readMcpSecretKey(write(key.toString('base64')));
    expect(read.equals(key)).toBe(true);
  });

  it('trims surrounding whitespace, such as a trailing newline', async () => {
    const key = randomBytes(32);
    const read = await readMcpSecretKey(write(`${key.toString('base64')}\n`));
    expect(read.equals(key)).toBe(true);
  });

  it('refuses a file that is not there, naming it', async () => {
    const missing = path.join(tmpdir(), 'rc-mcp-key-nowhere', 'key');
    await expect(readMcpSecretKey(missing)).rejects.toThrow(UnusableMcpSecretKeyError);
    await expect(readMcpSecretKey(missing)).rejects.toThrow(missing);
  });

  it('refuses a path that is a directory', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'rc-mcp-key-'));
    await expect(readMcpSecretKey(directory)).rejects.toThrow(UnusableMcpSecretKeyError);
  });

  it('refuses content that is not base64', async () => {
    await expect(readMcpSecretKey(write('not base64 at all!! @#$'))).rejects.toThrow(
      UnusableMcpSecretKeyError,
    );
  });

  it.each([[16], [24], [31], [33], [0]])(
    'refuses a key that decodes to the wrong length (%i bytes)',
    async (length) => {
      await expect(readMcpSecretKey(write(randomBytes(length).toString('base64')))).rejects.toThrow(
        UnusableMcpSecretKeyError,
      );
    },
  );

  it('never echoes the content of the file in the error message', async () => {
    const bad = 'ZGVmaW5pdGVseS1ub3QtYS1rZXk='; // base64, but not 32 bytes
    await expect(readMcpSecretKey(write(bad))).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining('definitely-not-a-key') as unknown as string,
      }) as Error,
    );
  });
});
