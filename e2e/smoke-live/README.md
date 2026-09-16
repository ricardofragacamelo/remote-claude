# `smoke-live` — against the real Claude

Everything under `specs/` runs against a **fake** Agent SDK: an end-to-end test has to be
deterministic, and Claude is not — each run also costs money. That is the rule in
[06-testing-strategy.md](../../docs/architecture/shared/06-testing-strategy.md).

This directory is the one exception. It talks to the real Claude Code on a real machine, and it
exists to catch the thing nothing else can: the SDK changing its contract under us.

**It never runs on a pull request.** `playwright.config.ts` excludes it from the default run;
CI invokes it nightly and on demand, and a failure here opens an issue instead of blocking a
merge. A flake on the critical path teaches everybody to ignore a red build.

It is empty today on purpose: the bootstrap plan deliberately does not talk to Claude
([escopo](../../docs/plans/00-bootstrap/README.md#escopo)). The first spec arrives with the
Agent SDK integration, in the plan after this one.
