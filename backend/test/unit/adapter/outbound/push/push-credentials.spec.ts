import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  UnusablePushCredentialsError,
  readPushCredentials,
} from '@adapter/outbound/push/push-credentials';

const complete = {
  client_email: 'push@service.invalid',
  // A marker, not a key: the reader only passes it on, and a key-shaped string in the repository
  // is what the secret scanner rightly refuses.
  private_key: 'not-a-real-signing-key',
  token_uri: 'https://exchange.invalid/token',
};

/** Writes a credentials file for one case, in a directory the suite created. */
function write(contents: string): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'rc-push-')), 'credentials.json');
  writeFileSync(file, contents, 'utf8');

  return file;
}

describe('reading the push credentials', () => {
  it('translates the file into what the exchange needs', async () => {
    expect(await readPushCredentials(write(JSON.stringify(complete)))).toEqual({
      issuer: 'push@service.invalid',
      privateKey: complete.private_key,
      tokenEndpoint: 'https://exchange.invalid/token',
    });
  });

  it('ignores whatever else the provider put in the file', async () => {
    const file = write(JSON.stringify({ ...complete, project_id: 'anything', type: 'whatever' }));

    expect((await readPushCredentials(file)).issuer).toBe('push@service.invalid');
  });

  it('refuses a file that is not there, naming it', async () => {
    const missing = path.join(tmpdir(), 'rc-push-nowhere', 'credentials.json');

    await expect(readPushCredentials(missing)).rejects.toThrow(UnusablePushCredentialsError);
    await expect(readPushCredentials(missing)).rejects.toThrow(missing);
  });

  it('refuses a file that is not JSON, and says so in its own words', async () => {
    await expect(readPushCredentials(write('not json'))).rejects.toThrow(
      UnusablePushCredentialsError,
    );
    await expect(readPushCredentials(write('not json'))).rejects.toThrow(/not valid JSON/);
  });

  // A JSON error from the runtime quotes the input it choked on, and the input is a file with a
  // private key in it. The message is ours precisely so that it cannot carry one.
  it('never quotes the file back, however badly it is written', async () => {
    const secret = '{ "private_key": "leaked';

    await expect(readPushCredentials(write(secret))).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining('leaked') as unknown as string,
      }) as Error,
    );
  });

  it.each([
    ['no address to issue as', { ...complete, client_email: undefined }],
    ['no key to sign with', { ...complete, private_key: undefined }],
    ['nowhere to exchange', { ...complete, token_uri: undefined }],
    ['an exchange that is not a URL', { ...complete, token_uri: 'nowhere' }],
  ])('refuses a file with %s', async (_, contents) => {
    await expect(readPushCredentials(write(JSON.stringify(contents)))).rejects.toThrow(
      UnusablePushCredentialsError,
    );
  });

  it('refuses a path that is a directory rather than a file', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'rc-push-'));

    await expect(readPushCredentials(directory)).rejects.toThrow(/could not be read/);
  });

  // The file holds a private key. Whatever the parser says about it is a sentence with a key in
  // it, and a message that carries one is a message that reaches a log.
  it('never puts the contents of the file in the message', async () => {
    const file = write(JSON.stringify({ ...complete, token_uri: 'nowhere' }));

    await expect(readPushCredentials(file)).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining(complete.private_key) as unknown as string,
      }) as Error,
    );
  });
});
