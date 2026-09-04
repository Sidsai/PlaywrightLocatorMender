import { readFileSync, readdirSync } from 'node:fs';

interface ProbeDump {
  entries: string[];
  checks: Record<string, boolean>;
  types: { type: string; count: number; keys: string[] }[];
}

const files = readdirSync('spike/out').filter((f) => f.endsWith('.json'));
if (files.length === 0) {
  console.error('no spike/out/*.json files found — run probe.ts against fixture traces first');
  process.exit(1);
}

// Infer a binding label from the filename (fixtures/{ts,python,java}-suite/...).
function bindingOf(filename: string): string {
  if (filename.includes('ts-suite')) return 'ts';
  if (filename.includes('python-suite')) return 'python';
  if (filename.includes('java-suite')) return 'java';
  return 'unknown';
}

const dumps = files.map((f) => ({
  file: f,
  binding: bindingOf(f),
  data: JSON.parse(readFileSync(`spike/out/${f}`, 'utf8')) as ProbeDump,
}));

// Matrix: event type -> which bindings have it.
const typesByBinding = new Map<string, Set<string>>();
for (const d of dumps) {
  for (const t of d.data.types) {
    const set = typesByBinding.get(t.type) ?? new Set<string>();
    set.add(d.binding);
    typesByBinding.set(t.type, set);
  }
}

const bindings = [...new Set(dumps.map((d) => d.binding))].sort();
console.log('=== EVENT TYPE PRESENCE BY BINDING ===');
console.log(`  ${'type'.padEnd(24)} ${bindings.map((b) => b.padEnd(8)).join('')}`);
for (const [type, set] of [...typesByBinding].sort()) {
  const row = bindings.map((b) => (set.has(b) ? 'YES'.padEnd(8) : 'no'.padEnd(8))).join('');
  console.log(`  ${type.padEnd(24)} ${row}`);
}

console.log('\n=== TYPES NOT PRESENT IN EVERY BINDING (potential inconsistency) ===');
let anyMismatch = false;
for (const [type, set] of [...typesByBinding].sort()) {
  if (set.size !== bindings.length) {
    anyMismatch = true;
    console.log(`  ${type}: present in [${[...set].join(', ')}], missing from [${bindings.filter((b) => !set.has(b)).join(', ')}]`);
  }
}
if (!anyMismatch) console.log('  none — every observed event type appears in every binding probed so far');

console.log('\n=== M0 CHECKS BY FILE ===');
for (const d of dumps) {
  const allYes = Object.values(d.data.checks).every(Boolean);
  console.log(`  [${allYes ? 'GO ' : 'NO '}] ${d.binding.padEnd(8)} ${d.file}`);
}
