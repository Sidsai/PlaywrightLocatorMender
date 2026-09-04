# M0 spike

This directory holds the tool that makes M0 empirical rather than assumption-based
(see `AI/DECISION.md` D-003). The trace format is undocumented and carries no
compatibility guarantee (TRD §2) — nothing here or in `packages/trace` may hardcode an
event schema from memory, a blog post, or an old version of Playwright's source. Every
claim about trace structure must be backed by a `probe.ts` run against a real,
committed fixture trace.

## Usage

```bash
npx tsx spike/probe.ts <path/to/trace.zip>
```

Prints:
- Every entry in the zip archive, with byte size.
- Every distinct `.trace` JSONL event `type`, with a count and the union of keys seen
  on events of that type.
- The six M0 checks (selector, error, apiName/method, snapshot, title, sdkLanguage
  presence) as a YES/NO table.

Also writes `spike/out/<trace-basename>.json` — the full structured dump, used as
evidence in `AI/DECISION.md` entries and in `spike/FINDINGS.md` (Task 11).

## `spike/compare.ts` (Task 10)

Loads every `spike/out/*.json` and prints an event-type × binding matrix, flagging any
type present in one binding's traces but absent in another's. This is what
Task 10/11 uses to answer whether TS, Python and Java traces are structurally
consistent, not just individually parseable.

## Why this is a spike, not shipped code

`spike/` is deliberately outside `packages/`. It is a diagnostic used once (or
re-run whenever a new Playwright version needs checking against the version matrix,
TRD §2) — it is not a dependency of the CLI, the trace parser, or the benchmark.
