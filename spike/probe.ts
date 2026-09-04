import { openTrace, readText } from '../packages/trace/src/zip.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { basename } from 'node:path';

const path = process.argv[2];
if (!path) {
  console.error('usage: probe <trace.zip>');
  process.exit(2);
}

const entries = openTrace(path);
console.log('=== ENTRIES ===');
for (const [name, buf] of entries) console.log(`  ${name}  (${buf.length} bytes)`);

// Any entry ending .trace is JSONL, one event per line.
const traceFiles = [...entries.keys()].filter((n) => n.endsWith('.trace'));
const byType = new Map<string, { count: number; sample: unknown; keys: Set<string> }>();

for (const f of traceFiles) {
  for (const line of (readText(entries, f) ?? '').split('\n')) {
    if (!line.trim()) continue;
    let ev: Record<string, unknown>;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    const t = String(ev.type ?? '<no type field>');
    const rec = byType.get(t) ?? { count: 0, sample: ev, keys: new Set<string>() };
    rec.count++;
    for (const k of Object.keys(ev)) rec.keys.add(k);
    byType.set(t, rec);
  }
}

console.log('\n=== EVENT TYPES ===');
for (const [t, r] of [...byType].sort((a, b) => b[1].count - a[1].count))
  console.log(`  ${t.padEnd(24)} ${String(r.count).padStart(5)}  keys: ${[...r.keys].join(', ')}`);

// The six questions M0 exists to answer.
const flat = JSON.stringify([...byType.values()].map((r) => r.sample));
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
  `spike/out/${basename(path, '.zip')}.json`,
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
console.log(`\nwrote spike/out/${basename(path, '.zip')}.json`);
