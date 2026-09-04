# TRD — Mender

**Technical design for locator repair across Playwright bindings**

**Status:** Draft v1.1 — free-first provider tiers, two-gate thresholds, Java identity precedence
**Companion doc:** `mender-prd.md`

---

## 1. Architecture

```
  trace.zip (any binding)
        │
        ▼
  ┌───────────────┐
  │ Trace Ingest  │  failed action, selector, error class,
  └───────┬───────┘  DOM snapshot, test identity
          ▼
  ┌───────────────┐
  │ Candidate     │  deterministic extraction from snapshot
  │ Extraction    │  → 10 ranked candidates
  └───────┬───────┘
          ▼
  ┌───────────────┐
  │ Heuristic     │  scores candidates, no model
  │ Scorer        │
  └───────┬───────┘
          ▼
  ┌───────────────┐   optional
  │ Reranker      │   model selects or declines
  └───────┬───────┘
          ▼
  ┌───────────────┐
  │ Patch         │  literal search + ambiguity guard
  │ Resolver      │  ← language adapter
  └───────┬───────┘
          ▼
  ┌───────────────┐
  │ Verifier      │  re-run one test  ← language adapter
  └───────┬───────┘
          ▼
     Reporter (stdout · patch · PR · CI comment)
```

Everything above the Patch Resolver is language-agnostic. Only the last two stages import an adapter.

## 2. Why the trace layer

Every Playwright binding wraps the same Node driver, and the driver writes the trace. A Java suite and a TypeScript suite produce traces the same Trace Viewer opens, which is the practical evidence that the format does not vary by binding.

Capturing there rather than at the test runtime removes the need for a fixture, plugin or SDK in any language. The alternative — hooking locator resolution per binding — was rejected because the JS API exposes hooks the Java and Python APIs do not, so it would have meant three divergent integrations to maintain and a different feature set in each.

**This is the project's largest technical bet.** The trace format is internal to Playwright and carries no compatibility guarantee. Mitigations:

- **M0 spike gates the project.** Before other work, confirm the failed action, its selector, the error class and a usable DOM snapshot are extractable from traces produced by Java, Python and TypeScript suites. The spike also settles two questions that shape later milestones: whether the trace carries a caller-settable title or metadata field (§8), and whether shadow-DOM content is captured uniformly across bindings (PRD §9).
- Parse defensively: treat every field as optional, fail to a clear "unsupported trace" message rather than a stack trace.
- Declare a supported Playwright version range in the README and enforce it in CI with a version matrix.
- Keep parsing behind one module (`@mender/trace`) so a format change is a contained rewrite.

## 3. Trace ingest

Input: one or more `trace.zip` paths, or a glob.

Output, per failure:

```ts
type FailureRecord = {
  traceId: string;
  testIdentity: TestIdentity;
  traceTitle?: string;          // caller-set tracing title, where the format carries one
  failureKind: "timeout" | "strict_violation";
  brokenSelector: string;
  actionIntent: string;         // action name + step title where present
  url: string;
  snapshot: DomSnapshot;        // nearest snapshot preceding the failed action
  screenshotRef?: string;
  playwrightVersion: string;
};
```

Failures whose kind is neither `timeout` nor `strict_violation` are discarded at this stage — assertion, navigation and frame failures are out of scope per PRD §4.

Snapshot selection takes the last snapshot captured before the failed action. Where several exist, the one closest in time wins.

## 4. Candidate extraction

The snapshot is reduced to an accessibility-oriented element list rather than raw markup: role, accessible name, visible text, stable-looking attributes (`data-testid`, `id`, `name`, `aria-*`), tag, and a path fingerprint.

Filtering: drop non-interactive containers with no accessible name, drop elements outside the viewport region of the failed action where that region is known, cap at 200 elements before scoring.

Determinism is a requirement, not a nicety — the same snapshot must always produce the same candidate list in the same order, because the benchmark's reproducibility depends on it.

## 5. Heuristic scorer

Scores every candidate with no model involved. Features:

| Feature | Signal |
|---|---|
| Attribute overlap | Shared `data-testid` / `id` tokens with the broken selector, edit distance on values |
| Role match | Inferred role from the broken selector vs candidate role |
| Text similarity | Normalised similarity between selector-implied text and accessible name |
| Structural proximity | DOM distance from the nearest ancestor that still resolves |
| Uniqueness | Penalty where the candidate is one of several near-identical siblings |

Output is a ranked top-10 with scores normalised to 0–1. This path alone constitutes the offline mode: the top candidate is proposed only where its margin over the second — `top1 − top2` — clears δ; otherwise Mender declines.

**The margin is load-bearing beyond offline mode.** M6, the duplicated near-identical element, *is* a margin collapse: a healthy-looking absolute score with almost nothing separating it from a twin. An absolute-score threshold cannot see that; the margin is the only runtime signal that the case is ambiguous at all. It therefore gates the reranked path too (§6), not just the offline one.

The heuristic scorer's full metrics are published before the reranker is built, so every later number has a baseline to be read against.

## 6. Reranker

Optional stage. Input is the broken selector, the action intent, and the top-10 candidates as structured JSON — never raw HTML, which keeps the token budget bounded and the redaction surface small.

Output is schema-enforced:

```ts
{
  chosenCandidateId: string | null,
  confidence: number,          // 0–1
  reasoning: string,
  rejectedReasons: Record<string, string>
}
```

`null` is the decline path and is exercised by the M7 corpus, not merely permitted by the schema.

**Calibration.** Self-reported confidence is not a probability, and τ means nothing until it is one. Stated confidence is binned against empirical correctness on the corpus and remapped — isotonic regression, or Platt scaling where the bin counts are thin. The fitted map ships as data rather than code, so it can be re-derived per provider and per model without a release. This matters most at the free tiers below: a small local model's raw confidence is worse calibrated than a frontier model's, and calibration is what makes it usable regardless.

Strict-mode violations use a different prompt: the task is choosing which of the matched elements was intended and proposing a narrowing qualifier, not finding a replacement.

**Provider abstraction.** One interface with base URL, model name and key from config or environment. Because the OpenAI-compatible request shape is what Ollama, vLLM, Groq, Gemini and OpenRouter all serve or approximate, every tier below is configuration rather than code.

Selection is free-first, and the task supports it. The reranker never writes a selector — P1 forbids it — it picks one of ten structured candidates and justifies the choice. That is classification, not authorship, and it sits comfortably inside a 7–8B model. Small local models are the intended default here, not a degraded fallback.

| Tier | Provider | Cost | Notes |
|---|---|---|---|
| 0 | None — heuristics only (§5) | Free | Default when no provider is configured |
| 1 | Local: Ollama, vLLM, llama.cpp | Free | Recommended reranker. Nothing leaves the machine, so the redaction surface is empty |
| 2 | Free-tier hosted: Gemini, Groq, OpenRouter free pool | Free, rate-limited | Redaction applies |
| 3 | Paid frontier | Metered | Opt-in ceiling, never selected implicitly |

Where a configured tier is unavailable — a local server that is not running, a free tier that is rate-limited — Mender degrades *downward* and says so. It never escalates cost silently.

**Ambiguity escalation.** Where the margin (§5) falls below δ but the reranker still returns a candidate, the case is re-sampled `voteCount` times at non-zero temperature against the *same* model. Unanimity is required to propose; any disagreement declines.

This replaces the second, more expensive model pass considered during design. M6 failures are ambiguity failures, and inter-run disagreement measures ambiguity directly, whereas a larger model merely answers a genuinely ambiguous question with more confidence. Because tiers 1 and 2 cost nothing per call, escalation runs on every ambiguous case instead of being rationed by budget.

**Determinism and caching.** The primary pass runs at temperature 0; non-zero temperature appears only inside ambiguity escalation. Every request is keyed by a hash of its rendered prompt and cached to disk, so re-scoring the corpus neither re-spends free-tier quota nor produces a second, different set of numbers. The benchmark depends on both properties.

**Redaction** runs before any request leaves the process: input values, text node contents and attribute values are replaced with type-preserving placeholders, retaining structure, roles and accessible names. Redaction is not optional and has no bypass flag.

It applies identically at every tier. At tier 1 nothing crosses a process boundary in the first place, which is why local inference is the recommended enterprise configuration rather than merely a permitted one.

## 7. Patch resolution

The failing line in a test is often not where the selector lives:

```java
// LoginTest.java
loginPage.clickSave();                          // fails here

// LoginPage.java
private final String saveBtn = "#save-btn";     // lives here
```

Call-graph analysis would resolve this correctly and would need a separate implementation per language. It was rejected in favour of **literal search with an ambiguity guard**: search the project for the exact broken selector string; patch it only where it occurs exactly once.

| Occurrences | Action |
|---|---|
| 1 | Patch in place |
| 0 | Decline — likely a dynamically built selector; report |
| 2+ | Decline — report every location for manual choice |

This handles Page Object Model without modelling it, behaves identically across languages, and fails safe. Dynamic selectors fall out as zero-match declines, which is the correct outcome given they are out of scope.

Search excludes build output, `node_modules`, `target`, `.venv` and anything gitignored.

## 8. Language adapters

An adapter implements two operations:

```ts
interface LanguageAdapter {
  applyPatch(file: string, oldSelector: string, newSelector: string): Patch;
  runSingleTest(identity: TestIdentity): Promise<TestResult>;
}
```

**TypeScript.** Patch is a string-literal replacement. Run via `npx playwright test -g "<title>"`.

**Java.** Patch handles string literals and constant fields. Running one test requires detecting the build tool and runner:

| Setup | Command shape |
|---|---|
| Maven + JUnit/TestNG | `mvn test -Dtest=Class#method` |
| Gradle + JUnit/TestNG | `gradle test --tests Class.method` |
| Cucumber | `mvn test -Dcucumber.filter.name="<scenario>"` |

Detection reads `pom.xml` or `build.gradle`; a config override exists for projects that defy detection.

**Test identity in Java.** In the JS and Python bindings, tracing is managed by the test runner and traces carry test metadata. In Java, tracing is started manually on the browser context, so a trace may not identify which test produced it.

Identity resolves to the first of these that succeeds:

| Source | Precedence | Notes |
|---|---|---|
| Trace title / metadata field | 1 | The user's tracing helper sets it to `Class#method`. Survives renaming, archiving and CI artifact handling, which the filename does not |
| Sidecar JSON beside the trace | 2 | Also written by the user's tracing helper |
| Filename convention `traces/<Class>#<method>.zip` | 3 | Zero-configuration fallback; brittle under archiving |
| None | — | Verification is skipped, nothing else is |

Whether the first row exists at all is an **M0 question, not an M6 one** (§2). If the trace carries a settable title, it becomes the documented recommendation and the other two demote to fallbacks; the open problem closes three milestones earlier than planned.

**Missing identity blocks verification only — not patching.** The adapter interface above makes the reason plain: `applyPatch` takes a file and two strings, while only `runSingleTest` takes an identity. Patch resolution is a literal search across the project (§7) and never needed to know which test failed. Withholding the patch would make Java worse than TypeScript at the tool's central job for no technical reason.

Proposals therefore carry an explicit verification state rather than being suppressed:

| State | Meaning |
|---|---|
| `verified` | The proposal was applied to a scratch copy and the affected test passed |
| `unavailable` | Verification could not be attempted — identity unresolved, or no adapter for the language |

Proposals that were verified and failed are discarded rather than labelled (§9). `unavailable` is surfaced prominently in every reporter mode. P2 is unaffected: a human still reads the diff, and report-only remains the default.

## 9. Verifier

Applies the proposal to a scratch copy of the source, runs the single affected test, and discards any proposal that does not pass. Timeout is twice the original test's recorded duration. The original file is restored regardless of outcome.

Verification filters bad proposals. It does not establish correctness — a proposal bound to the wrong element can pass — which is why the benchmark measures false repairs structurally instead (PRD §8).

Where verification cannot be attempted at all — no adapter for the language, or unresolved test identity (§8) — the proposal is still reported, carrying `unavailable`. It is never silently presented as though it had passed.

## 10. Reporter

Four modes, sharing one result object.

- `--dry-run` (default): human-readable report to stdout, exit 0.
- `--patch`: writes changes to source, prints a diff.
- `--pr`: commits to a branch and opens a pull request with the diff, rejected candidates and reasoning.
- `--ci`: comments on the pull request associated with the failing run. Does not fail the build — the build already failed, and a second failure adds nothing. Does not open a separate PR, which would create merge-ordering problems.

Every mode shows the runner-up candidate and the margin alongside the proposal, and every mode shows the verification state (§8). Surfacing the margin lets the human see ambiguity directly, which is cheaper and more honest than adding a third outcome state between proposing and declining — P3 stays binary.

JSON output (`--json`) is available in every mode for downstream tooling.

## 11. Configuration

`mender.config.json` at project root, all fields optional:

```jsonc
{
  "language": "java",              // auto-detected when absent
  "buildTool": "maven",
  "provider": {
    "baseUrl": "http://localhost:11434/v1",  // tier 1 (local) is the default
    "model": "qwen2.5:7b"
  },
  "offline": false,                // heuristics only, no network
  "confidenceThreshold": 0.85,     // τ — calibrated confidence, see §6
  "marginThreshold": 0.15,         // δ — top1 − top2, see §5
  "voteCount": 3,                  // ambiguity escalation samples
  "cacheDir": ".mender-cache",
  "searchExclude": ["fixtures/**"]
}
```

Absent any provider configuration, Mender runs offline rather than erroring. No configuration causes a paid provider to be selected implicitly.

**Both gates must pass.** A proposal requires calibrated confidence ≥ τ *and* margin ≥ δ. τ alone cannot detect M6; δ alone cannot detect a case where every candidate is wrong.

τ and δ ship at the values above as pre-corpus defaults, chosen for asymmetric loss — a missed repair costs a maintainer minutes, a false repair costs the tool its premise. Both are re-derived from the risk–coverage curve at M3 for heuristics and M4 for each provider tier, against the interval bound in PRD §8 rather than the point estimate. Both stay overridable, and the reporter prints the false-repair rate the shipped default was measured at, so anyone changing them knows what they are trading.

## 12. Testing the tool itself

The benchmark measures repair quality. It does not test the tool's own correctness, which needs its own suite:

- **Trace parsing:** fixture traces from Java, Python and TS suites across the supported Playwright version range, committed to the repo. Run on every commit.
- **Patch resolution:** synthetic projects exercising inline selectors, POM constants, base-class inheritance, multi-occurrence and zero-occurrence cases.
- **Adapters:** sample projects per build tool and runner combination in CI.
- **Redaction:** property test asserting no source text survives into an outbound payload.
- **Reranker cache and determinism:** a second scoring run over the corpus must produce byte-identical results and issue no network requests.
- **Provider degradation:** an unreachable local server and an exhausted free tier must both degrade downward to heuristics with a stated reason, never upward to a paid tier.

## 13. Performance budget

| Stage | Budget |
|---|---|
| Trace parse | < 2s per trace |
| Candidate extraction | < 500ms |
| Heuristic scoring | < 100ms |
| Rerank — tier 1, local | < 5s |
| Rerank — tiers 2–3, hosted | < 8s |
| Ambiguity escalation | one rerank budget, ambiguous cases only |
| Verification | bounded by the test itself |

Traces are processed in parallel with a concurrency cap; verification is serialised, since parallel single-test runs against a shared application are unreliable.

Escalation issues its `voteCount` samples **concurrently**, so its wall-clock cost is one rerank plus scheduling rather than `voteCount` times one. Serialising them would put escalated cases at 15s of rerank alone and break the PRD's 15s p95 outright, so concurrency here is a requirement rather than an optimisation.

## 14. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Trace format changes or lacks needed fields | High | M0 spike gates the project; isolated parser module; version matrix in CI |
| Java test identity unavailable from trace | Low | Three-source precedence (§8), the first checked at M0; degrade to skipping verification only, keeping analysis, reporting and patching |
| Free-tier rate limits or model withdrawal break the default path | Medium | Tier 1 is local and unmetered; prompt-hash cache removes repeat spend; degradation is downward to heuristics, which is always available |
| Small local models too weak to rerank usefully | Medium | Calibration per model; the benchmark reports each tier separately, so a weak tier is visible rather than hidden — and heuristics remain the floor |
| Benchmark mutations unrealistically easy | Medium | Author M6 and M7 by hand; validate against real selector-change history in git |
| Public corpus too narrow in DOM idiom | Medium | Selection is by idiom rather than app count (PRD §9); optional private held-out set checks for overfitting |
| Heuristics match the model, making rerank decorative | Low | Acceptable — report it; the finding is more useful than the feature |
| Snapshots too large on dense pages | Low | Scope extraction to the region around the failed action |
| Adapter surface grows faster than it can be maintained | Medium | Two languages in v1; analysis works everywhere without one |
