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

## What it runs

| Spec | Scenario | What it proves against the real CLI |
|---|---|---|
| `sdk-contract.spec.ts` | [01 · S-83](../../docs/plans/01-live-session/scenarios.md) | a real turn answers, and every message of it maps |
| `commands-and-init.spec.ts` | [04 · S-52](../../docs/plans/04-transcript-and-resume/scenarios.md) | `supportedCommands()` lists this installation's commands, `/init` among the suggested; `/init` asks for its `Write` through the normal flow and finishes, and the file is there |
| `claude-panel.spec.ts` | [08 · S-270…S-272](../../docs/plans/08-claude-panel/scenarios.md) | a reference is read by a `Read` the trail records; `@notes.md` in the text never reaches the model behind the hook's back; `supportedModels()`, `mcpServerStatus()` and `getContextUsage()` answer; a skill of the project is listed under the name the menu inserts; an image reaches the model; thinking and a subagent come shaped as the recordings are |

`claude-panel.spec.ts` runs in a folder made for the run too — a `notes.md` with a codeword of the
run, and the skill in `.claude/skills/` — and lets through only reading inside it. The skills of the
user and of the system belong to plan 13, and are asserted once it exists.

`/init` **writes into the project**, so it never runs against a fixed repository or against ours: the
spec makes one for the run — `git init` in a folder of its own inside the allowlist, two files, one
commit — and removes it at the end ([D-07](../../docs/plans/04-transcript-and-resume/decisions.md#d-07--onde-o-init-pode-escrever)).
Of the questions the real `/init` asks, the spec allows only a write inside that folder, and refuses
the rest.
