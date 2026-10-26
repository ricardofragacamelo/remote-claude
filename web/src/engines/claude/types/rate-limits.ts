import type {
  RateLimitsViewPayload,
  RateLimitsViewPayloadWindowsItem,
} from '@remote-claude/contracts';

/** One rate-limit window of the account, as last observed on the stream (plan 16, D-09). */
export type RateLimitWindow = RateLimitsViewPayloadWindowsItem;

/** `GET /engines/claude/usage/rate-limits` — never real-time, only what was last observed. */
export type RateLimitsView = RateLimitsViewPayload;
