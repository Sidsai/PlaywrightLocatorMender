# Mender

**Self-healing locator repair for Playwright suites.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Playwright suites fail for two reasons that look identical in CI: a real regression,
where the application is broken and the test did its job — and locator drift, where
the application is fine but a class string changed, a wrapper element appeared, or a
`data-testid` was renamed, so the selector no longer resolves.

Drift dominates in any suite under active development. Each instance is cheap to fix
by hand and the aggregate is not: a suite that goes red for reasons unrelated to
product quality is a suite people stop reading, and the next real regression ships
right through it.

Mender reads the artifacts a failed run already produced (`trace.zip`), works out
which element the broken selector was aiming at, and proposes a corrected selector
for a human to approve. It never writes a selector from scratch — every proposal
points at an element that actually existed on the page — and it never merges its own
repairs. A tool that always proposes something is worse than no tool, so declining
cleanly is a first-class outcome, not a failure mode.

See [`mender-prd.md`](mender-prd.md) and [`mender-trd.md`](mender-trd.md) for the
full product and technical design behind these decisions.

## Install

```bash
npm install --save-dev playwright-mender
```

No API key, no account, no configuration required to get started — the default path
runs entirely offline.

## Quickstart

A test fails. Playwright already wrote a trace (add `trace: 'on'` — or
`'retain-on-failure'` — to your Playwright config if it isn't already). Point Mender
at it:

```bash
npx playwright-mender repair --trace test-results/**/trace.zip
```

```
test-results/LoginTest-saves-the-form/trace.zip
  broken   #save-btn-RENAMED
  9 candidates extracted
  proposed  #save-btn
  runner-up #cancel-btn
  confidence ?   ·   margin 0.10
  verification unavailable
```

That's report-only — nothing on disk changed. Once you trust a proposal:

```bash
npx playwright-mender repair --trace test-results/**/trace.zip --patch
```

```
  patched src/pages/LoginPage.ts:14
  --- src/pages/LoginPage.ts
  +++ src/pages/LoginPage.ts
  - private readonly saveButton = page.locator('#save-btn-RENAMED');
  + private readonly saveButton = page.locator('#save-btn');
```

Mender found the Page Object Model file the broken selector actually lives in — not
the test file where the failure surfaced — without any special POM-awareness in the
code. It's a literal search for the exact broken selector string across the project:
one occurrence patches; zero occurrences declines (probably a selector built at
runtime, like `` `#row-${id}` ``); two or more declines and lists every location for
you to choose by hand. That guard runs every time, even in CI, even automated —
[verified against this project's own repository](mender-trd.md), where it correctly
refused to guess among 22 real occurrences of a shared fixture string rather than
picking one.

## Use cases

**A developer repairs a failing test locally, in seconds, without reading a diff.**
You refactor a component, a `data-testid` moves, three unrelated tests go red. Run
`playwright-mender repair --trace test-results/**/trace.zip --patch`, review the
three one-line diffs it prints, commit. No manual trace-viewer archaeology.

**CI comments on the PR that broke a test, with a ready-made fix.** The intended
design, once `--ci`/`mode: ci` wiring ships (see [Planned](#planned-not-yet-in-v010)):
wire the [GitHub Action](#github-action) into your workflow and, when a job fails from
drift, Mender posts a comment on the associated pull request naming the broken
selector, the proposed fix, and its confidence — never failing the build a second
time, never opening a competing PR. A human decides whether to take the suggestion.

**A locked-down enterprise environment where no page content may leave the
machine.** The default heuristic path (tier 0) sends nothing anywhere — no network
call is made at all. If heuristics alone aren't accurate enough for your suite, tier
1 (a local Ollama/vLLM model) still sends nothing anywhere; only tiers 2–3 (hosted
models) leave the machine, and only with explicit opt-in and redaction that has no
bypass flag.

**A maintainer opens a real PR instead of a silent local patch** — the intended design,
once `--pr` wiring ships (see [Planned](#planned-not-yet-in-v010)): commit the change
to a branch and open a pull request whose body carries the diff, the candidates Mender
rejected, and why — never merged automatically (there is no configuration option or
code path that does it).

**A team benchmarks a competing locator-healing tool against Mender's own numbers.**
`playwright-mender-bench` ships as a separate package: a mutation engine, a frozen
public corpus, and a scoring harness, so any tool's repair rate and false-repair rate
are measured the same way Mender's own are.

## CLI reference

```bash
npx playwright-mender repair --trace <glob...> [--patch] [--json]
```

| Flag | Behaviour |
|---|---|
| *(none)* | Report-only (dry-run). Nothing is written. This is the default. |
| `--patch` | Writes the proposed change to source and prints a diff. |
| `--json` | Machine-readable output, available alongside any of the above. |

`--pr` and `--ci` are designed (see [Planned](#planned-not-yet-in-v010)) but not yet
wired into the CLI — passing them today has no effect.

## GitHub Action

```yaml
- uses: Sidsai/PlaywrightLocatorMender@v1
  with:
    trace: test-results/**/trace.zip
    mode: patch # dry-run (default) | patch
```

`mode: pr` and `mode: ci` are accepted as inputs but not yet functional (see
[Planned](#planned-not-yet-in-v010)) — only `dry-run` and `patch` currently do
anything. `action.yml` also accepts `provider-tier`/`provider-base-url`/
`provider-model`/threshold inputs for a future reranker configuration story; like
the CLI itself, these currently have no effect (see the reranker note below).

## Supported Playwright versions

`1.48.0` – `1.99.99`. A trace outside this range is declined with a clear message
naming both bounds, never a raw stack trace. The floor matches the oldest fixture
trace this project has actually run against (Java's) — the trace format carries no
compatibility guarantee, so nothing is assumed beyond what's been verified.

## Language support

| Language | Analysis | Patch + verify |
|---|---|---|
| TypeScript / JavaScript | Yes | Yes |
| Java (Maven, Gradle; JUnit, TestNG, Cucumber) | Yes | Yes |
| Python (pytest-playwright) | Yes | Not yet (v1.1) |
| .NET | Backlog | Backlog |

Analysis works for every binding because it reads only the trace, which every
Playwright binding's shared Node driver writes in the same format — no fixture,
plugin, or SDK integration needed in your test project for any language.

## The reranker: free by default

Mender's default path (offline heuristic scoring) sends nothing anywhere and needs
no API key or network access — the recommended default for any team that cannot let
page content leave the machine. A model can improve on the heuristic result; it is
not required for one.

Where a model is used, provider selection is free-first, in tiers:

| Tier | Provider | Cost |
|---|---|---|
| 0 | Heuristics only | Free — the default |
| 1 | Local (Ollama, vLLM) | Free — recommended reranker |
| 2 | Free-tier hosted (Gemini, Groq, OpenRouter's free pool) | Free, rate-limited |
| 3 | Paid frontier | Metered, opt-in only |

Degradation on failure is always **downward**, never toward a more expensive tier —
if a local server is unreachable, Mender falls back to heuristics, not to a paid
API, even if a paid key is present in the environment. A paid tier is only ever used
when it's the sole tier configured, meaning a human already made that choice
explicitly.

Tiers 1–3's logic (redaction, the tier ladder, calibration, ambiguity escalation, the
two-gate decision) is implemented and unit-tested in isolation, but is **not yet
wired into the CLI** — `playwright-mender repair` only ever runs tier 0 today, so
configuring a provider currently has no effect. See
[Planned](#planned-not-yet-in-v010).

## Privacy

- **Offline heuristic mode sends nothing anywhere.** No network call is made.
- **A local model (tier 1) also sends nothing anywhere** — recommended wherever
  heuristics alone aren't enough and page content still can't leave the machine.
- With any hosted model (tiers 2–3), redaction runs before any request leaves the
  process, with no bypass flag: input values, arbitrary text, and non-structural
  attribute values are replaced with type-preserving placeholders. Accessible names
  and a fixed set of structural identifier attributes (`id`, `data-testid`, `name`,
  `type`, `href`, `for`, `class`) are retained, since they're what the retrieval
  mechanism needs to reason about candidates at all.
- Bring-your-own-key. Nothing is proxied or stored remotely by Mender itself.
- Provider is configurable by base URL, so a local Ollama/vLLM instance needs
  configuration, not a separate code path.

## Thresholds

A proposal requires the top candidate's margin over the runner-up to clear
`marginThreshold`. Once a reranker is in use, calibrated confidence must also clear
`confidenceThreshold` — both gates are required, not either alone, since a
near-identical duplicate element can produce high apparent confidence with a
collapsed margin.

`marginThreshold` ships at **0.06**, derived from a real sweep against the committed
benchmark corpus (`packages/bench/corpus/`) — not chosen by hand. At this threshold,
the heuristic-only scorer measures:

| Metric | Value |
|---|---|
| Repair rate | 18.2% |
| False-repair rate (Wilson 95% upper bound) | 1.06% |
| Abstention accuracy | 97.6% |

See [`packages/bench/RESULTS-heuristics.md`](packages/bench/RESULTS-heuristics.md)
for the full per-mutation-class breakdown. `confidenceThreshold` stays at a
pre-corpus default of 0.85 until a reranker tier's own sweep re-derives it — that
value only applies once a reranker is configured.

Both thresholds are overridable programmatically (`RepairOptions`) today; a
project-level config file is designed but not yet read by the CLI — see
[Planned](#planned-not-yet-in-v010). The shipped default and the false-repair rate
it was measured at are always printed alongside any override.

## Planned (not yet in v0.1.0)

These are designed, and in most cases already implemented as tested, isolated
modules — they're just not yet wired into the CLI or Action. Listed here explicitly
rather than presented as available, since v0.1.0 does not do any of this today.

- **`--pr` / `--ci` CLI flags** and the GitHub Action's `mode: pr` / `mode: ci` —
  open a real pull request with the diff and reasoning, or comment on the PR
  associated with a failing CI run. The provider interfaces
  (`PrProvider`/`CiCommentProvider`) exist and are tested against fakes; no
  GitHub-backed implementation is wired to them yet.
- **`mender.config.json`** project config file, all fields optional:

  ```jsonc
  {
    "language": "java",              // auto-detected when absent
    "buildTool": "maven",            // auto-detected from pom.xml/build.gradle
    "provider": {
      "baseUrl": "http://localhost:11434/v1",
      "model": "qwen2.5:7b"
    },
    "offline": false,                // heuristics only, no network
    "confidenceThreshold": 0.85,
    "marginThreshold": 0.06,
    "voteCount": 3,                  // ambiguity-escalation samples
    "searchExclude": ["fixtures/**"]
  }
  ```

  No loader for this file exists yet; the shape above is the intended format.
  Absent any provider configuration, once implemented, Mender will run offline
  rather than erroring — that fallback behavior already holds true today by default,
  since no provider wiring exists at all yet.
- **Reranker tiers 1–3** wired into the CLI — see the note under
  "The reranker: free by default" above.

## The benchmark

`playwright-mender-bench` (`packages/bench/`) ships as a mutation engine, a frozen
corpus, and a scoring harness. Any locator-healing tool can be scored against it.
The corpus is captured once and committed — snapshots are never fetched live at run
time, so results are comparable across runs and across tools. False-repair rate is
always reported as the Wilson 95% upper bound, never the point estimate.

## License

MIT.
