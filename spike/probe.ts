import { openTrace, readText } from '../packages/trace/src/zip.js';
import { writeFileSync, mkdirSync } from 'node:fs';

const path = process.argv[2];
if (!path) {
  console.error('usage: probe <trace.zip>');
  process.exit(2);
}

// Playwright always names the artifact "trace.zip" inside a per-test directory, so a
// bare basename() collides across every trace probed (found empirically running this
// against fixtures/ts-suite's two fixture traces — both are literally "trace.zip").
// Derive the output name from the full relative path instead.
const outName = path.replace(/\.zip$/i, '').replace(/[\\/:]+/g, '__');

const entries = openTrace(path);
console.log('=== ENTRIES ===');
for (const [name, buf] of entries) console.log(`  ${name}  (${buf.length} bytes)`);

// Any entry ending .trace is JSONL, one event per line.
const traceFiles = [...entries.keys()].filter((n) => n.endsWith('.trace'));
const byType = new Map<string, { count: number; sample: unknown; keys: Set<string> }>();
const allEvents: Record<string, unknown>[] = [];

for (const f of traceFiles) {
  for (const line of (readText(entries, f) ?? '').split('\n')) {
    if (!line.trim()) continue;
    let ev: Record<string, unknown>;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    allEvents.push(ev);
    const t = String(ev.type ?? '<no type field>');
    const rec = byType.get(t) ?? { count: 0, sample: ev, keys: new Set<string>() };
    rec.count++;
    // Keep the sample with the richest params — a bare "before" hook call (params: {})
    // is a poor representative next to a Frame.click carrying a real selector. Without
    // this, hasSelector/hasApiName can read NO purely because the first-seen event of
    // a type happened to be an uninteresting one (found empirically — see
    // AI/DECISION.md D-014).
    const richer = JSON.stringify(ev).length > JSON.stringify(rec.sample).length;
    if (richer) rec.sample = ev;
    for (const k of Object.keys(ev)) rec.keys.add(k);
    byType.set(t, rec);
  }
}

console.log('\n=== EVENT TYPES ===');
for (const [t, r] of [...byType].sort((a, b) => b[1].count - a[1].count))
  console.log(`  ${t.padEnd(24)} ${String(r.count).padStart(5)}  keys: ${[...r.keys].join(', ')}`);

// The six questions M0 exists to answer. Scanned across EVERY event, not just one
// sample per type — see the "richer sample" comment above for why that distinction
// matters empirically.
const flat = JSON.stringify(allEvents);
const checks: Record<string, boolean> = {
  hasSelector: /"selector"/.test(flat),
  hasError: /"error"/.test(flat),
  hasApiName: /"apiName"|"method"/.test(flat),
  hasSnapshot: [...byType.keys()].some((t) => /snapshot/i.test(t)),
  hasTitle: /"title"/.test(flat),
  hasSdkLanguage: /"sdkLanguage"/.test(flat),
};
console.log('\n=== M0 CHECKS ===');
for (const [k, v] of Object.entries(checks)) console.log(`  ${v ? 'YES' : 'NO '}  ${k}`);

mkdirSync('spike/out', { recursive: true });
writeFileSync(
  `spike/out/${outName}.json`,
  JSON.stringify(
    {
      entries: [...entries.keys()],
      checks,
      types: [...byType].map(([t, r]) => ({ type: t, count: r.count, keys: [...r.keys], sample: r.sample })),
    },
    null,
    2,
  ),
);
console.log(`\nwrote spike/out/${outName}.json`);
