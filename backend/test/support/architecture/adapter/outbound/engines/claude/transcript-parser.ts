// A deliberate violation: a transcript read by a parser of ours instead of by the SDK — S-09.
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

export const lines = createInterface({ input: createReadStream('/dev/null') });
