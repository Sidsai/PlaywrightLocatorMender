#!/usr/bin/env node
import { runRepair } from './repair.js';

/**
 * CLI entry point. Currently supports: `repair --trace <glob...> [--json] [--patch]`.
 * Default mode is --dry-run (report-only, exit 0) per TRD §10 — --patch is accepted
 * here for forward compatibility but not yet acted on (Task 58).
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command !== 'repair') {
    console.error('usage: playwright-mender repair --trace <glob...> [--json] [--patch]');
    process.exit(2);
  }

  const trace: string[] = [];
  let json = false;
  let patch = false;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--trace') {
      while (args[i + 1] && !args[i + 1].startsWith('--')) trace.push(args[++i]);
    } else if (args[i] === '--json') {
      json = true;
    } else if (args[i] === '--patch') {
      patch = true;
    }
  }

  if (trace.length === 0) {
    console.error('error: --trace requires at least one path or glob pattern');
    process.exit(2);
  }

  const { exitCode, output } = await runRepair({ trace, json, patch });
  console.log(output);
  process.exit(exitCode);
}

main();
