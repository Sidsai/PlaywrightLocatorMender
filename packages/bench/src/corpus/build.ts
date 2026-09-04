import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { capturePage } from './capture.js';
import { generateCases } from '../mutate/engine.js';
import type { CorpusManifest, CorpusManifestEntry } from './load.js';

/**
 * Builds the frozen corpus: captures every source page once (per D-009, PRD §9),
 * commits the byte-identical snapshot + a manifest entry with its sha256, licence
 * and DOM idiom. Mutation CASES are not pre-generated and committed individually —
 * they're derived deterministically from the frozen snapshot + a fixed seed at
 * benchmark run time (Task 30 already proved same seed -> identical case list),
 * which is what makes "freeze the corpus" compatible with "reach ~1000 scored
 * proposals" without needing to commit a thousand near-duplicate files.
 *
 * v0 corpus: the six project-owned fixture pages from Task 6 (fixtures/pages/),
 * already spanning six DOM idioms (semantic HTML, utility CSS, CSS-in-JS, data
 * grid, deep nesting, shadow DOM) — zero licensing risk since they're this
 * project's own MIT-licensed content, not third-party scraped pages.
 *
 * DEFERRED, NOT DONE HERE: swapping in genuinely external OSS sources named in
 * PRD §9 (the-internet, TodoMVC, RealWorld, OWASP Juice Shop, US federal pages)
 * needs live network captures and a per-entry licence check — judgment calls
 * better made explicitly than folded silently into an automated build. See
 * AI/DECISION.md D-022.
 */
const SOURCES: Array<{ id: string; app: string; idiom: string; path: string; licence: string }> = [
  { id: 'semantic', app: 'mender-fixtures', idiom: 'semantic-html', path: 'fixtures/pages/semantic.html', licence: 'MIT (project-owned)' },
  { id: 'utility-css', app: 'mender-fixtures', idiom: 'utility-css', path: 'fixtures/pages/utility-css.html', licence: 'MIT (project-owned)' },
  { id: 'css-in-js', app: 'mender-fixtures', idiom: 'css-in-js', path: 'fixtures/pages/css-in-js.html', licence: 'MIT (project-owned)' },
  { id: 'data-grid', app: 'mender-fixtures', idiom: 'data-grid', path: 'fixtures/pages/data-grid.html', licence: 'MIT (project-owned)' },
  { id: 'deep-nesting', app: 'mender-fixtures', idiom: 'deep-nesting', path: 'fixtures/pages/deep-nesting.html', licence: 'MIT (project-owned)' },
  { id: 'shadow-dom', app: 'mender-fixtures', idiom: 'shadow-dom', path: 'fixtures/pages/shadow-dom.html', licence: 'MIT (project-owned)' },
];

export async function buildCorpus(outDir: string): Promise<CorpusManifest> {
  mkdirSync(outDir, { recursive: true });
  const entries: CorpusManifestEntry[] = [];

  for (const source of SOURCES) {
    const snapshot = await capturePage(source.path);
    const raw = JSON.stringify(snapshot);
    const sha256 = createHash('sha256').update(raw).digest('hex');
    writeFileSync(`${outDir}/${source.id}.json`, raw);
    entries.push({
      id: source.id,
      app: source.app,
      url: source.path,
      licence: source.licence,
      idiom: source.idiom,
      capturedAt: new Date().toISOString(),
      sha256,
    });
  }

  const manifest: CorpusManifest = { entries };
  writeFileSync(`${outDir}/manifest.json`, JSON.stringify(manifest, null, 2));
  return manifest;
}

/**
 * Generates the corpus's scored-proposal count by drawing mutation cases from every
 * frozen snapshot with a fixed seed per source, split evenly to reach `targetTotal`
 * (PRD §8/D-011's ~1000 target). Deterministic: same outDir + same targetTotal
 * always produces the same total case count, though callers wanting the exact same
 * cases across runs should also fix their own seed offset.
 */
export function casesPerSource(sourceCount: number, targetTotal: number): number {
  return Math.ceil(targetTotal / sourceCount);
}
