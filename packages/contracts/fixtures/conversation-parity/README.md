# Conversation-parity fixtures

Plan [26](../../../../docs/plans/26-mobile-conversation-parity/F6-parity-gate.md), F6, B-28: the common
input the web's `conversation-reducer` and the app's `session_event_mapper`/`Conversation` are both
tested against, so a client that reads the same events into different content fails here, not in
production. Generated — never hand-written — by `pnpm fixtures:conversation-parity`
(`backend/scripts/record-conversation-parity-fixtures.ts`), through the real `SdkMessageMapper` and
`historicalEvents` the backend ships, from the five recordings of plan 26's B-02
(`backend/test/fakes/agent-sdk/fixtures/`). Re-run that script and commit what it writes whenever a
recording changes; do not edit the `*-events.json` files by hand.

## One folder per fixture

- `live-events.json` — what the backend publishes over the live WebSocket, in order: the user's
  prompt (`message.completed`, the event `handOverPrompt` sends — the SDK stream itself never echoes
  what was typed), then every event the SDK's own messages map to, ending in `turn.completed`.
- `history-events.json` — the same conversation, reloaded: what `historicalEvents` makes of the
  session's own history. No `turn.completed` — a turn's cost and duration are live-only, never filed
  to disk — and, for a fixture with a subagent, none of what the subagent itself said (that is a
  separate route, read on demand).
- `subagent-history-events.json` — present only for `subagent-permission-turn`: the subagent's own
  history, read the way the app's B-20 route reads it.
- `expected.json` — the neutral content both clients must reach: `{ "entries": Entry[] }`, written by
  hand against `live-events.json` and double-checked against it (never generated from either client's
  own reducer, or the check would only prove a client agrees with itself).

## The neutral `Entry`

One flat, ordered list — a message's blocks are the `text`/`image` content of a role, in the order it
arrived; a tool call, a thinking block and the turn's summary are their own entries, exactly as the
F6 doc lists them, not blocks of a message. The field `owner` is `null` for the main conversation, or
the `toolUseId` of the `agent`-kind tool a subagent's own entry nests under (plan 26, B-18…B-21) — the
one thing a client must use to put it back in the right place, never which engine or tool produced it.

```ts
type Entry =
  | { kind: 'message'; owner: string | null; author: 'user' | 'assistant'; blocks: Block[] }
  | { kind: 'thinking'; owner: string | null; text: string; redacted: boolean }
  | { kind: 'tool'; owner: string | null; toolKind: string; label: ToolLabel; status: string; media: unknown[] }
  | { kind: 'turn'; owner: null; usage: TurnCompletedPayloadUsage | null; costUsd: string | null };

type Block = { kind: 'text'; text: string } | { kind: 'image'; mediaType: string; size: number };
```

A `toolUse` content block of a `message.completed` carries no entry of its own — the matching
`tool.started`/`tool.completed` pair already is one, at the position it arrives.

## What each file is checked against

- `live-events.json` → `expected.entries`, whole.
- `history-events.json` → `expected.entries`, with every `turn` entry dropped, and — only for a
  fixture with a subagent — every entry whose `owner` is not `null` also dropped (the main thread's
  history never carries what a subagent said).
- `subagent-history-events.json` → the entries of `expected.entries` whose `owner` is that subagent's
  `toolUseId`.

The web and the app each write their own small projector — the client's reducer/mapper, folded over
one of these event files, turned into this same shape — and compare it to the slice above. Neither
projector is the fixture's source of truth; `expected.json` is.
