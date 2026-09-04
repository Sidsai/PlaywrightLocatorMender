# PRD — Mender

**Self-healing locator repair for Playwright suites**

**Working title:** Mender (`playwright-mender`)
**Author:** G. Sai Siddharth
**Status:** Draft v1.1 — open questions §12 resolved; free-first provider policy; public corpus
**License:** MIT
**Companion doc:** `mender-trd.md`

---

## 1. Problem

Playwright suites fail for two reasons that look identical in CI.

A real regression means the application is broken and the test did its job. Locator drift means the application is fine, but a class string changed, a wrapper element appeared, or a `data-testid` was renamed, and the selector no longer resolves.

Drift dominates on any suite under active development. Each instance is cheap to fix and the aggregate is not: a suite that goes red for reasons unrelated to product quality is a suite people stop reading. Once engineers start assuming red means drift, the suite has stopped working as a signal, and the next real regression ships.

Mender reads the artifacts a failed run already produced, works out which element the broken selector was aiming at, and proposes a corrected selector for a human to approve.

## 2. Users

**Primary — the suite maintainer.** A QA engineer or SDET responsible for 100+ Playwright tests against a UI that changes weekly. They spend a recurring slice of every week on repairs that require no thought, only lookup.

**Secondary — the team lead evaluating adoption.** Cares about whether the tool can be trusted near the merge button, and whether page content leaves the network.

Both write Playwright in different languages. Java and Python suites are common in enterprise QA and are usually excluded from JS-first tooling.

## 3. Goals

1. Work with any Playwright binding without integration code in the test project.
2. Propose a corrected locator, or decline clearly when no safe correction exists.
3. Run with no model API at all, for teams that cannot send page content off-machine.
4. Publish honest quality measurements, including a public benchmark others can run.

## 4. Non-goals

- **Auto-merging repairs.** Permanently out of scope, not deferred. See §7.
- **Repairing assertion failures.** If the element resolves and the assertion fails, that is a regression and Mender stays out of it.
- **Repairing navigation or frame failures.** Usually environment or product bugs, not drift.
- **Generating tests.**
- **Repairing dynamically constructed selectors** (`"#row-" + id`). Detected and reported, never patched.
- **Hosting anything.** No server, no key custody, no dashboard.
- **Cypress or Selenium support.**

## 5. How it works, from the user's side

A test fails. Playwright writes a trace. The user runs:

```bash
npx playwright-mender repair --trace test-results/**/trace.zip
```

Mender parses the trace, finds the failed action and the DOM snapshot taken around it, extracts candidate elements, ranks them, and prints a proposal:

```
LoginTest › saves the form
  broken   page.locator("#save-btn")          LoginPage.java:34
  proposed page.getByRole("button", { name: "Save changes" })
  runner-up  page.getByRole("button", { name: "Save draft" })
  confidence 0.91   ·   margin 0.34   ·   3 candidates rejected
  verified ✓ (test passes with proposed locator)
```

With `--patch` it edits the source. With `--pr` it opens a pull request. In CI it comments on the failing pull request. Default is report-only.

## 6. Language support

Analysis is language-agnostic because it reads only the trace, which the shared Playwright driver writes in the same format regardless of binding. Two steps are not: editing source, and re-running a single test to verify. Those need a per-language adapter.

| Language | Analysis | Patch + verify | Version |
|---|---|---|---|
| TypeScript / JavaScript | Yes | Yes | v1 |
| Java (Maven, Gradle; JUnit, TestNG, Cucumber) | Yes | Yes | v1 |
| Python (pytest-playwright) | Yes | Yes | v1.1 |
| .NET | Yes | No | Backlog |

Java is in v1 deliberately. It is the hardest adapter — two build tools, three runners, and Cucumber scenarios that are not methods — and building it alongside TypeScript keeps the core from quietly assuming a JavaScript-shaped world.

Without an adapter, Mender still identifies the drift and names the file and line. The user applies the change.

## 7. Product principles

**P1 — Retrieval and ranking, not generation.** The model never writes a selector. Candidates are extracted from the DOM snapshot deterministically; the model chooses among them and explains the choice. Every proposal points at an element that existed on the page.

**P2 — A human merges.** The dangerous failure is not a missed repair, it is a confident wrong one that turns a genuine regression into a green build. No configuration option enables unattended merging.

**P3 — Declining is a first-class outcome.** A tool that always proposes something is worse than no tool. Ambiguity, dynamic selectors, and deleted elements all resolve to an explicit "no safe repair" with the reason.

**P4 — Offline by default is viable, and models are free by default.** The heuristic path runs with no API key and no network. The model improves the result; it is not required for one. Where a model is used, a free local one is the default and a paid provider is an opt-in ceiling that is never selected implicitly.

## 8. Success metrics

| Metric | Definition | Target |
|---|---|---|
| Repair rate | Repairable mutations where the proposal resolves to the ground-truth element | ≥ 75% |
| **False-repair rate** | Proposals resolving to a different element than ground truth | **≤ 3%** |
| Abstention accuracy | Unrepairable mutations correctly declined | ≥ 90% |
| Lift over heuristics | Repair rate with reranker minus heuristics alone | Reported, no target |
| Cost per repair | Mean API spend per attempted repair | $0 on the default path; < $0.02 where a paid provider is opted into |
| p95 latency | Trace ingest through proposal | < 15s |

False-repair rate is the headline. It is measured structurally, against the element the mutation engine recorded as the target, not by whether the re-run passes — a proposal can bind to the wrong element and still produce a passing test, and that silent pass is the exact failure this metric exists to catch. Verification by re-run is a filter, not ground truth.

Lift has no target on purpose. If heuristics alone clear the bar, that is a finding to publish rather than a result to bury. It is reported per provider tier rather than as one number — heuristics alone, heuristics plus a free local model, heuristics plus a paid frontier model. If most of the lift turns out to be available at zero cost, that is the most useful row in the table.

**The 3% is an upper bound, not a point estimate.** Claiming ≤ 3% means the upper bound of the Wilson 95% interval clears 3%, which fixes the size of the corpus rather than leaving it to taste:

| Proposals scored | False repairs observed | Point estimate | Wilson 95% upper |
|---|---|---|---|
| 400 | 6 | 1.5% | 3.2% — fails |
| 400 | 4 | 1.0% | 2.5% — passes |
| 1000 | 15 | 1.5% | 2.5% — passes |

At 400 scored proposals the claim survives only four false repairs across the entire corpus, which is too brittle to publish against. **The corpus targets roughly 1000 scored proposals**, and that figure — not a page count or an application count — is what sizes M2. See §9.

## 9. The benchmark

`playwright-mender-bench` ships as a separate public package: a mutation engine, a labelled corpus, and a scoring harness. Any locator-healing tool can be scored against it.

Mutation classes:

| Class | Description | Repairable |
|---|---|---|
| M1 | Rename `data-testid` or `id` | Yes |
| M2 | Swap utility class strings | Yes |
| M3 | Wrap the target in extra elements | Yes |
| M4 | Reorder siblings | Yes |
| M5 | Alter visible text slightly | Yes |
| M6 | Duplicate a near-identical element elsewhere | Yes — adversarial |
| M7 | Delete the element | **No** |
| M8 | Make the selector match two elements (strict-mode violation) | Yes |

M6 and M7 carry the benchmark. M6 produces false repairs; M7 tests declining. Composition targets roughly 15% M7 and 20% M6, so neither headline metric can be gamed by a system that always guesses or always abstains.

### Corpus

The corpus is built from permissively-licensed open-source applications, not from any single private one. A benchmark whose only subject is the author's own product invites the obvious objection, and the objection would be correct.

**Snapshots are frozen and committed.** Applications are captured once and versioned into the package as static DOM fixtures. The benchmark never fetches a live site at run time: a corpus that drifts underneath the harness cannot support comparison across runs, let alone across tools, which is the entire reason for publishing it. The applications are a source, not a dependency.

**Selection is by DOM idiom, not by application count.** The heuristic features in TRD §5 behave completely differently depending on how markup is authored, so the corpus spans the axis that actually stresses them:

| Idiom | Why it is included |
|---|---|
| Semantic HTML with real ARIA | The favourable case; establishes the ceiling |
| Utility CSS (Tailwind and similar) | M2 class swaps are trivial to generate and class tokens carry almost no signal |
| CSS-in-JS with hashed class names | Attribute overlap is near-useless; forces reliance on role and text |
| Table- and grid-heavy pages | M4 sibling reordering is at its most punishing |
| Deep component nesting | M3 wrapper insertion has room to do damage |

Five applications sharing one idiom is as narrow a corpus as one private application, only less visibly so. TodoMVC and RealWorld are valuable precisely because the same interface ships in many frameworks, giving genuinely different markup for identical semantics — a controlled variable rather than an accident.

Candidate sources include `the-internet` (MIT, purpose-built for test automation), TodoMVC (MIT), RealWorld/Conduit implementations (MIT), OWASP Juice Shop (MIT) and United States federal government pages, whose works are public domain. Licences are checked individually rather than assumed: Wikipedia, a tempting choice, is CC BY-SA and carries attribution and share-alike obligations rather than being public domain.

Shadow DOM is excluded from v1 unless the M0 spike shows snapshot capture is uniform across bindings.

A slice derived from a private application may be retained as a **held-out set**, used to check that threshold tuning has not overfitted the public corpus. It never forms part of the published score.

## 10. Privacy and data handling

DOM snapshots contain whatever the test fixtures put on the page.

- Offline heuristic mode sends nothing anywhere. This is the recommended enterprise default.
- A local model (Ollama, vLLM) also sends nothing anywhere, so the reranker is available to teams that cannot let page content leave the machine. This is the recommended configuration where heuristics alone are not enough, and it is free.
- With a model enabled, input values, text nodes and attribute values are redacted before the request, retaining structure, roles, and accessible names.
- Bring-your-own-key. Mender proxies nothing and stores nothing remotely.
- Provider is configurable by base URL, so pointing at a local Ollama or vLLM instance needs no separate code path.

## 11. Release plan

| Milestone | Contents |
|---|---|
| M0 | Trace-format spike — confirm selector, snapshot and error data are extractable from Java, Python and TS traces. Also: is there a caller-settable trace title (TRD §8), and is shadow-DOM content captured uniformly (§9)? |
| M1 | Trace ingest, candidate extraction, report-only CLI |
| M2 | Benchmark package: mutation engine, frozen open-source corpus of ~1000 scored proposals, scoring harness |
| M3 | Heuristic scorer, δ derived from the risk–coverage curve, full metrics published |
| M4 | Model reranker, free-first provider tiers, confidence calibration, prompt caching, redaction |
| M5 | Patch resolution and verification: TypeScript adapter |
| M6 | Java adapter, including Cucumber |
| M7 | GitHub Action, PR commenting, public release |

M0 gates everything. If the trace does not carry what the design assumes, the architecture changes and this document is rewritten before any code is kept.

## 12. Resolved design questions

1. **Confidence threshold.** Two gates, both required: a margin gate on `top1 − top2` and a confidence gate on *calibrated* reranker confidence. Pre-corpus defaults are δ = 0.15 and τ = 0.85, chosen for asymmetric loss rather than symmetry. Both are re-derived from the risk–coverage curve at M3 and M4, against the interval bound in §8 rather than the point estimate. The margin gate carries the weight, because M6 is a margin collapse and an absolute score cannot detect one. See TRD §5, §6, §11.

2. **Whether M6 justifies a second, more expensive model pass.** No. Ambiguous cases are re-sampled several times against the *same* free model and must agree unanimously to yield a proposal. Disagreement measures ambiguity directly; a larger model only answers an ambiguous question with more confidence. Free inference makes this affordable on every ambiguous case rather than on a rationed few. See TRD §6.

3. **Test identity in Java.** Resolved into a precedence order — trace title, sidecar JSON, filename convention — with the first checked by the M0 spike rather than deferred to M6. Missing identity blocks verification only: analysis, reporting *and patching* continue, with the proposal labelled `unavailable`. Patch resolution is a literal string search and never needed test identity. See TRD §8.

4. **Corpus composition.** Frozen snapshots of permissively-licensed open-source applications, selected to span DOM idioms and sized to roughly 1000 scored proposals. No private application appears in the published score; one may be retained as a held-out overfitting check. See §9.

Open, and deliberately so: the calibration map is per-model, so each provider tier needs its own before its numbers can be read against the others, and whether the free tiers hold their calibration across upstream model updates is not yet known.
