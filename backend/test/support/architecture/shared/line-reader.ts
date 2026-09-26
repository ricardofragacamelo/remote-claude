// A deliberate violation: a line reader outside the transcript slice is still a JSONL parser's start.
import { createInterface } from 'node:readline';

export const reader = createInterface;
