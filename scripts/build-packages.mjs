// Bundles the two publishable packages (playwright-mender, playwright-mender-bench)
// into self-contained dist/index.js files. Necessary because their source uses
// relative imports reaching across sibling packages (packages/trace, packages/core,
// packages/adapter-typescript) — correct for developing in this monorepo, but those
// siblings are never published, so a published package must have everything it
// needs bundled into its own directory. Anticipated in AI/FLOW.md's Task 19/39
// notes ("becomes package-name imports once a build/exports setup lands... M7") —
// this is that bundling step.
import { build } from 'esbuild';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';

const targets = [
  {
    name: 'playwright-mender',
    entry: 'packages/cli/src/index.ts',
    outfile: 'packages/cli/dist/index.js',
    external: ['glob'],
    executable: true,
  },
  {
    name: 'playwright-mender-bench',
    entry: 'packages/bench/src/index.ts',
    outfile: 'packages/bench/dist/index.js',
    external: ['playwright'],
    executable: false,
  },
];

for (const t of targets) {
  mkdirSync(dirname(t.outfile), { recursive: true });
  await build({
    entryPoints: [t.entry],
    outfile: t.outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    external: t.external,
    banner: { js: t.executable ? '' : '' }, // shebang already present in cli/src/index.ts, esbuild preserves it
  });
  if (t.executable) chmodSync(t.outfile, 0o755);
  console.log(`built ${t.name} -> ${t.outfile}`);
}
