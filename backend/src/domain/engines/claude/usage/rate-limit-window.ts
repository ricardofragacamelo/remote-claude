/** The three outcomes a rate-limit reading reports — our own names, never the SDK's snake_case. */
export type RateLimitStatus = 'allowed' | 'allowedWarning' | 'rejected';

/**
 * One rate-limit window of the account, as last observed on the stream (plan 16, D-09). The account
 * is the machine's: every session of every user updates and reads the same windows.
 */
export interface RateLimitWindow {
  /**
   * The window's own name — `five_hour`, `seven_day`, `seven_day_opus`… — forwarded exactly as the
   * CLI names it, so a window a future CLI adds shows up here before a release of ours knows its
   * label, the same survival rule `SdkMessageMapper` follows for a message variant it does not
   * recognise.
   */
  readonly kind: string;

  readonly status: RateLimitStatus;

  /** 0–100, rounded; `null` when the CLI did not report a reading for this window. */
  readonly utilizationPercent: number | null;

  /** When the window resets, or `null` when the CLI did not say. */
  readonly resetsAt: Date | null;

  /** When this backend last saw this window on the stream. */
  readonly observedAt: Date;

  /**
   * The server's own label for a per-model window (`"Fable"`, say) — only `model_scoped` windows
   * from {@link rateLimitWindowsFromUsageProbe} carry one, since there is no fixed `kind` for a
   * model the next one of these adds; every other window is labelled by its `kind` instead, which a
   * client already has a translation for.
   */
  readonly displayName?: string;
}

const STATUSES: ReadonlyMap<string, RateLimitStatus> = new Map([
  ['allowed', 'allowed'],
  ['allowed_warning', 'allowedWarning'],
  ['rejected', 'rejected'],
]);

/**
 * A `rate_limit_event` reading, read defensively into our own shape.
 *
 * `raw` is read as an untyped record on purpose — this file never imports the SDK's own type
 * (ADR-006, `sdk-is-isolated`): the one adapter that does hands this function the `rate_limit_info`
 * object of the message it just read, exactly as `claudeInitializationOf` already reads an
 * `SDKMessage`-shaped answer by field name rather than by import.
 *
 * `resetsAt` arrives as an epoch the SDK does not document as seconds or milliseconds; read as
 * milliseconds only once it is clearly too large to be seconds (`> 1e12` is the year 33658 in
 * seconds, and the year 2001 in milliseconds — no real `resetsAt` is ever that old in seconds).
 * `utilization` is read the same way: a fraction (`0`–`1`) or an already-given percentage
 * (`0`–`100`), whichever the value looks like — the SDK's own comment names the field but not its
 * scale.
 *
 * Answers `null` when the reading does not even carry a window name or a status this build knows —
 * logged by the caller as an unmapped variant, never thrown.
 */
export function rateLimitWindowOf(
  raw: {
    readonly rateLimitType?: unknown;
    readonly status?: unknown;
    readonly utilization?: unknown;
    readonly resetsAt?: unknown;
  },
  observedAt: Date,
): RateLimitWindow | null {
  const kind = typeof raw.rateLimitType === 'string' ? raw.rateLimitType : null;
  const status = typeof raw.status === 'string' ? STATUSES.get(raw.status) : undefined;

  if (kind === null || status === undefined) {
    return null;
  }

  return {
    kind,
    status,
    utilizationPercent: percentOf(raw.utilization),
    resetsAt: epochOf(raw.resetsAt),
    observedAt,
  };
}

/** [value] as a whole percent, 0–100 — accepting either a `0`–`1` fraction or an already-given one. */
function percentOf(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  const percent = value <= 1 ? value * 100 : value;
  return Math.round(Math.min(Math.max(percent, 0), 100));
}

/** [value] as an instant — accepting either a seconds or a milliseconds epoch. */
function epochOf(value: unknown): Date | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return new Date(value > 1e12 ? value : value * 1000);
}

/** A plain `{ utilization, resets_at }` window, the shape every fixed window of the usage probe has. */
interface ProbeWindow {
  readonly utilization: unknown;
  readonly resets_at: unknown;
}

function isProbeWindow(value: unknown): value is ProbeWindow {
  return value !== null && typeof value === 'object';
}

/** [value] already as a whole percent (0–100) — the usage probe never gives a fraction. */
function probePercentOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.min(Math.max(value, 0), 100))
    : null;
}

/** [value] as an instant, read as an ISO 8601 string — the usage probe's own `resets_at` format. */
function isoOf(value: unknown): Date | null {
  if (typeof value !== 'string') {
    return null;
  }

  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * A status this build has no categorical reading for, guessed from the percent alone — the usage
 * probe's `rate_limits` gives only a number, never `allowed`/`allowed_warning`/`rejected` the way a
 * live `rate_limit_event` does. The thresholds are this build's own guess, not Anthropic's: the
 * closest the screen can get to the same three words without the real category.
 */
function statusFromPercent(percent: number | null): RateLimitStatus {
  if (percent === null) {
    return 'allowed';
  }

  if (percent >= 100) {
    return 'rejected';
  }

  return percent >= 80 ? 'allowedWarning' : 'allowed';
}

function windowOf(
  kind: string,
  raw: ProbeWindow,
  observedAt: Date,
  displayName?: string,
): RateLimitWindow {
  const utilizationPercent = probePercentOf(raw.utilization);

  return {
    kind,
    status: statusFromPercent(utilizationPercent),
    utilizationPercent,
    resetsAt: isoOf(raw.resets_at),
    observedAt,
    ...(displayName === undefined ? {} : { displayName }),
  };
}

/** The fixed windows of `SDKControlGetUsageResponse.rate_limits`, each read only if it is there. */
const FIXED_WINDOWS: readonly string[] = [
  'five_hour',
  'seven_day',
  'seven_day_oauth_apps',
  'seven_day_opus',
  'seven_day_sonnet',
];

/**
 * The windows of a usage-probe answer — `query.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET()`
 * — read into our own shape, the one way to read a window **without** a session open (plan 16, D-09
 * only covers `rate_limit_event`; this is the on-demand complement the screen asks for when nothing
 * has pushed one yet).
 *
 * Explicitly experimental, by the SDK's own name for it: read defensively, field by field, and a
 * shape this build does not recognise contributes nothing rather than throwing. `raw` is the
 * `rate_limits` object of the answer, or `null`/`undefined` when the account has none (an API key, a
 * cloud provider, or a missing profile scope) — answers `[]` then, never a guess.
 */
export function rateLimitWindowsFromUsageProbe(raw: unknown, observedAt: Date): RateLimitWindow[] {
  if (!isPlainRecord(raw)) {
    return [];
  }

  return [
    ...fixedWindowsOf(raw, observedAt),
    ...modelScopedWindowsOf(raw['model_scoped'], observedAt),
    ...overageWindowOf(raw['extra_usage'], observedAt),
  ];
}

/** `five_hour`, `seven_day`… — each read only when the probe actually carries it. */
function fixedWindowsOf(raw: Record<string, unknown>, observedAt: Date): RateLimitWindow[] {
  return FIXED_WINDOWS.flatMap((kind) => {
    const window = raw[kind];
    return isProbeWindow(window) ? [windowOf(kind, window, observedAt)] : [];
  });
}

/**
 * `model_scoped[]` — the per-model weekly windows (`"Fable"`, say). Keyed by the model's own label,
 * not by position: the array's order is not a promise, and a kind that moved would otherwise leave a
 * stale, never-updated entry of its old index behind in the store (`RateLimitStore.observe` replaces
 * by `kind`, never by position).
 */
function modelScopedWindowsOf(raw: unknown, observedAt: Date): RateLimitWindow[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.flatMap((entry: unknown) => {
    const displayName = isPlainRecord(entry) ? entry['display_name'] : undefined;
    return isPlainRecord(entry) && isProbeWindow(entry) && typeof displayName === 'string'
      ? [windowOf(`model_scoped:${slugOf(displayName)}`, entry, observedAt, displayName)]
      : [];
  });
}

/** `extra_usage` — only a window when overage is actually enabled for this account. */
function overageWindowOf(raw: unknown, observedAt: Date): RateLimitWindow[] {
  return isPlainRecord(raw) && raw['is_enabled'] === true && isProbeWindow(raw)
    ? [windowOf('overage', raw, observedAt)]
    : [];
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** [name] as an ASCII-lowercase, hyphenated key — stable across probes for the same display name. */
function slugOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
