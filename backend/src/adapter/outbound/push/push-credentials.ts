import { readFile } from 'node:fs/promises';
import { z } from 'zod';

/**
 * The service account the push provider issued, as read from disk.
 *
 * A **file** and not a variable, for the same reason the workspace allowlist is one: a private
 * key in an environment variable is a private key in every process listing, every crash dump and
 * every container inspect. The path is configuration; the contents never are.
 *
 * Nothing here names a vendor. The token endpoint and the audience come out of the file, which is
 * what keeps the provider's name inside the credential it issued
 * ([AGENTS.md](../../../../../AGENTS.md)).
 */
const credentialsSchema = z.object({
  client_email: z.string().min(1),
  private_key: z.string().min(1),
  token_uri: z.url(),
});

/** What the adapter needs to sign an assertion and exchange it for an access token. */
export interface PushCredentials {
  readonly issuer: string;
  readonly privateKey: string;
  readonly tokenEndpoint: string;
}

/** A credentials file that is missing, unreadable, or not the shape the exchange needs. */
export class UnusablePushCredentialsError extends Error {
  constructor(file: string, reason: string) {
    super(`the push credentials at ${file} cannot be used: ${reason}`);
    this.name = 'UnusablePushCredentialsError';
  }
}

/**
 * Reads the credentials, or refuses to produce any.
 *
 * It is read lazily rather than at boot, and that is a deliberate difference from the workspace
 * allowlist: a bad allowlist must stop the process, because it is the security boundary. Push is
 * a best effort beside a deadline that is not — a backend that would not start because nobody has
 * set up notifications yet would be a backend that trades the whole product for one of its
 * conveniences.
 *
 * @throws {UnusablePushCredentialsError} naming the file and what is wrong with it
 */
export async function readPushCredentials(file: string): Promise<PushCredentials> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    throw new UnusablePushCredentialsError(file, describe(error));
  }

  const credentials = credentialsSchema.safeParse(parsed);
  if (!credentials.success) {
    throw new UnusablePushCredentialsError(file, 'it is missing a field the exchange needs');
  }

  return {
    issuer: credentials.data.client_email,
    privateKey: credentials.data.private_key,
    tokenEndpoint: credentials.data.token_uri,
  };
}

/**
 * What went wrong, in our own words.
 *
 * Deliberately **not** the parser's. A JSON error from V8 quotes the input it choked on, and the
 * input here is a file containing a private key — so quoting it would put the credential in the
 * message, and a message ends up in a log. Two answers is all a reader needs: the file is not
 * JSON, or it could not be read at all.
 */
function describe(error: unknown): string {
  return error instanceof SyntaxError ? 'it is not valid JSON' : 'it could not be read';
}
