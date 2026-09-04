# Mender

**Self-healing locator repair for Playwright suites.**

Mender reads the artifacts a failed run already produced (`trace.zip`), works out
which element the broken selector was aiming at, and proposes a corrected selector
for a human to approve. It never merges its own repairs, never writes a selector
from scratch, and it declines cleanly when it doesn't have a safe answer.

See [`mender-prd.md`](mender-prd.md) and [`mender-trd.md`](mender-trd.md) for the
full product and technical design.

## Usage

```bash
npx playwright-mender repair --trace test-results/**/trace.zip
```

```
fixtures/traces/ts-1.62.1-timeout.zip
  broken   #save-btn-RENAMED
  9 candidates extracted
  proposed  #save-btn
  runner-up #cancel-btn
  confidence ?   ·   margin 0.10
  verification unavailable
```

- `--patch` writes the change to source and prints a diff.
- `--pr` opens a pull request carrying the diff, rejected candidates, and reasoning.
  A human always merges it — there is no configuration option, and no code path,
  that merges automatically.
- `--ci` comments on the pull request associated with the failing run; it never
  fails the build a second time, and it never opens a separate PR.
- `--json` is available in every mode for downstream tooling.
- No flags: report-only (dry-run), the default.

## Supported Playwright versions

`1.48.0` – `1.99.99`. A trace outside this range is declined with a clear message
naming both bounds, never a raw stack trace. The floor matches the oldest fixture
trace this project has actually run against (Java's — the trace format carries no
compatibility guarantee, so nothing is assumed beyond what's been verified).

## Language support

| Language | Analysis | Patch + verify |
|---|---|---|
| TypeScript / JavaScript | Yes | Yes |
| Java (Maven, Gradle; JUnit, TestNG, Cucumber) | Yes | Yes |
| Python (pytest-playwright) | Yes | Not yet (v1.1) |
| .NET | Backlog | Backlog |

Analysis works for every binding because it reads only the trace, which every
Playwright binding's shared Node driver writes in the same format. Patch resolution
is a literal search for the broken selector string across the project — one
occurrence patches, zero declines (likely a dynamically built selector), two or more
declines and reports every location. This handles Page Object Model in any language
without modelling it.

## The reranker: free by default

Mender's default path (offline heuristic scoring) sends nothing anywhere and needs
no API key or network access — this is the recommended default for any team that
cannot let page content leave the machine. A model can improve on the heuristic
result; it is not required for one.

Where a model is used, provider selection is free-first, in tiers:

| Tier | Provider | Cost |
|---|---|---|
| 0 | Heuristics only | Free — the default |
| 1 | Local (Ollama, vLLM) | Free — recommended reranker |
| 2 | Free-tier hosted (Gemini, Groq, OpenRouter's free pool) | Free, rate-limited |
| 3 | Paid frontier | Metered, opt-in only |

Degradation on failure is always **downward**, never toward a more expensive tier —
if a local server is unreachable, Mender falls back to heuristics, not to a paid
API, even if a paid key is present in the environment. A paid tier is only ever
used when it's the sole tier configured, meaning a human already made that choice
explicitly.

## Privacy

- **Offline heuristic mode sends nothing anywhere.** No network call is made.
- **A local model (tier 1) also sends nothing anywhere** — recommended wherever
  heuristics alone aren't enough and page content still can't leave the machine.
- With any hosted model (tiers 2–3), redaction runs before any request leaves the
  process, with no bypass flag: input values, arbitrary text, and non-structural
  attribute values are replaced with type-preserving placeholders. Accessible
  names and a fixed set of structural identifier attributes (id, data-testid,
  name, type, href, for, class) are retained, since they're what P1's matching
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

`marginThreshold` ships at **0.06**, derived from a real sweep against the
committed benchmark corpus (`packages/bench/corpus/`, 360 scored proposals as of
this measurement) — not chosen by hand. At this threshold, the heuristic-only
scorer measures:

| Metric | Value |
|---|---|
| Repair rate | 18.2% |
| False-repair rate (Wilson 95% upper bound) | 1.06% |
| Abstention accuracy | 97.6% |

See [`packages/bench/RESULTS-heuristics.md`](packages/bench/RESULTS-heuristics.md)
for the full per-mutation-class breakdown. `confidenceThreshold` stays at a
pre-corpus default of 0.85 until a reranker tier's own sweep re-derives it — that
value only applies once a reranker is configured.

Both thresholds are overridable in `mender.config.json`; the shipped default and
the false-repair rate it was measured at are always printed alongside any override.

## Configuration

`mender.config.json` at the project root, all fields optional:

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

Absent any provider configuration, Mender runs offline rather than erroring.

## The benchmark

`playwright-mender-bench` (`packages/bench/`) ships as a mutation engine, a
frozen corpus, and a scoring harness. Any locator-healing tool can be scored
against it. The corpus is captured once and committed — snapshots are never
fetched live at run time, so results are comparable across runs and across tools.
False-repair rate is always reported as the Wilson 95% upper bound, never the
point estimate.

## License

MIT.
