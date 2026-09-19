# `smoke-live` — against the real Claude

Everything under `specs/` runs against a **replay of a recorded run** of the Agent SDK: an
end-to-end test has to be deterministic, and Claude is not — each real run also costs money. That
is the rule in [06-testing-strategy.md](../../docs/architecture/shared/06-testing-strategy.md).

This directory is the one exception. It talks to the real Claude Code on a real machine, and it
exists to catch the thing nothing else can: the SDK changing its contract under us.

**It never runs on a pull request.** It has a configuration of its own — `playwright.live.config.ts`
— rather than a flag on the default one, because a suite that can be included by forgetting a flag
is a suite that eventually runs in CI and starts costing money. `playwright.config.ts` ignores this
directory outright.

Run it with:

```bash
pnpm test:e2e:live
```

That brings the ephemeral stack up with the **product's** entry point behind it, rather than the
scripted one every other suite uses, and refuses to start when there is no Claude logged in on
this machine — the backend inherits that login by design, and there is deliberately no variable
for the credential.

## What it asserts, and what it deliberately does not

Not the words the model chose: those are different every run, and a test that pinned them would
fail for no reason at all.

What it asserts is that **every message of a real turn was one this build recognises**. The mapper
has a survival branch — a variant it has never seen is dropped, logged as
`unmapped sdk message variant — dropped`, and the session carries on. That is the right behaviour
and it is also exactly why a warning nobody reads is how a contract break reaches production
quietly. This suite reads it: the run keeps the backend's own log, and the spec fails if that line
is in it.

See [S-83](../../docs/plans/01-live-session/scenarios.md) and
[D-12](../../docs/plans/01-live-session/decisions.md#d-12--onde-o-smoke-live-roda).
