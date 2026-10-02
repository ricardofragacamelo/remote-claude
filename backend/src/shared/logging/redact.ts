/** What replaces a value that must never reach a log. */
export const REDACTED = '[REDACTED]';

/** Payloads above this are truncated — never dropped in silence. */
export const MAX_PAYLOAD_BYTES = 8_192;

/** How deep the walk goes before it stops descending. Cheap insurance against a cyclic object. */
const MAX_DEPTH = 8;

/**
 * Field names that never reach a log, matched as a substring, case-insensitively, at any depth.
 *
 * The list lives in the logger and not in the judgement of whoever writes a log line: a rule that
 * depends on someone remembering it is a rule that leaks the first time someone is in a hurry.
 * See docs/architecture/shared/03-logging.md#redação-o-que-nunca-vai-para-o-log.
 */
const SENSITIVE = [
  'authorization',
  'cookie',
  'credential',
  'password',
  'secret',
  'token',
  'apikey',
  'api_key',
  'code_verifier',
  'codeverifier',
];

/** Whether a field name is one that never gets logged. */
export function isSensitive(name: string): boolean {
  const lowered = name.toLowerCase();
  return SENSITIVE.some((needle) => lowered.includes(needle));
}

/**
 * A copy of `value` with every sensitive field replaced.
 *
 * Arrays and plain objects are walked; everything else is returned as it is.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth >= MAX_DEPTH) {
    return REDACTED;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redact(entry, depth + 1));
  }

  if (typeof value !== 'object' || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      isSensitive(key) ? REDACTED : redact(entry, depth + 1),
    ]),
  );
}

/**
 * A copy of `value` with the named top-level fields replaced — for a route that keeps fields out of
 * the log that no name-based rule would catch. Anything that is not a plain object is returned as
 * it is.
 */
export function omitting(value: unknown, fields: readonly string[]): unknown {
  if (fields.length === 0 || typeof value !== 'object' || value === null || Array.isArray(value)) {
    return value;
  }

  const copy: Record<string, unknown> = { ...value };
  for (const field of fields.filter((name) => name in copy)) {
    copy[field] = REDACTED;
  }

  return copy;
}

/**
 * What a frame of a given type carries that never reaches a log, though no name gives it away: the
 * text the person handed over as the context of a prompt — the output of a terminal — goes to Claude
 * and to no line of ours (plan 08, S-204). Each is replaced by the marker, so the line still says it
 * was there and how the frame was shaped.
 */
const FRAME_CONTENT: Readonly<Record<string, { readonly list: string; readonly field: string }>> = {
  'session.prompt': { list: 'attachments', field: 'content' },
};

/** The payload of a frame of `type`, with what {@link FRAME_CONTENT} keeps out of the log replaced. */
export function framePayloadForLog(type: string, payload: unknown): unknown {
  const rule = FRAME_CONTENT[type];

  if (rule === undefined || typeof payload !== 'object' || payload === null) {
    return payload;
  }

  const items = (payload as Record<string, unknown>)[rule.list];

  if (!Array.isArray(items)) {
    return payload;
  }

  return {
    ...payload,
    [rule.list]: items.map((item: unknown) =>
      typeof item === 'object' && item !== null && rule.field in item
        ? { ...item, [rule.field]: REDACTED }
        : item,
    ),
  };
}

/** A payload and whether it had to be cut down to fit the cap. */
export interface LoggedPayload {
  readonly payload: unknown;
  readonly truncated: boolean;
}

/**
 * Redacts, then caps.
 *
 * Over the cap the payload becomes its own serialised prefix plus `truncated: true`. Omitting an
 * oversized payload in silence turns a large request into a log line that says nothing.
 */
export function forLog(value: unknown): LoggedPayload {
  const safe = redact(value);
  const serialised = JSON.stringify(safe) ?? '';

  if (Buffer.byteLength(serialised, 'utf8') <= MAX_PAYLOAD_BYTES) {
    return { payload: safe, truncated: false };
  }

  return { payload: serialised.slice(0, MAX_PAYLOAD_BYTES), truncated: true };
}
