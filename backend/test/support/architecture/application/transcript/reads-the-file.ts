// A deliberate violation: a use case of the transcript opening the JSONL itself — S-09.
import { readFile } from 'node:fs/promises';

export const read = (file: string): Promise<string> => readFile(file, 'utf8');
