import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface PatchOccurrence {
  file: string;
  line: number; // 1-indexed
}

export interface PatchResolution {
  action: 'patch' | 'decline';
  occurrences: PatchOccurrence[];
  reason?: string;
}

const DEFAULT_EXCLUDES = ['node_modules', '.git', 'dist', 'target', '.venv', '.mender-cache', 'build', '.gradle'];

function shouldExclude(name: string, extraExcludes: string[]): boolean {
  return DEFAULT_EXCLUDES.includes(name) || extraExcludes.includes(name);
}

function walkFiles(root: string, extraExcludes: string[]): string[] {
  const out: string[] = [];
  (function walk(dir: string) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (shouldExclude(entry, extraExcludes)) continue;
      const full = join(dir, entry);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) walk(full);
      else if (stat.isFile()) out.push(full);
    }
  })(root);
  return out;
}

function findOccurrences(root: string, brokenSelector: string, extraExcludes: string[]): PatchOccurrence[] {
  const occurrences: PatchOccurrence[] = [];
  for (const file of walkFiles(root, extraExcludes)) {
    let content: string;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue; // binary or unreadable — skip, don't throw
    }
    if (!content.includes(brokenSelector)) continue;
    const lines = content.split('\n');
    lines.forEach((lineText, i) => {
      if (lineText.includes(brokenSelector)) {
        occurrences.push({ file: relative(root, file), line: i + 1 });
      }
    });
  }
  return occurrences;
}

/**
 * Patch resolution per TRD §7: literal search with an ambiguity guard. Search the
 * project for the exact broken selector string; patch only where it occurs
 * exactly once. This handles Page Object Model without modelling it (the selector
 * lives in a page-object file, the failure originates in a test file — this
 * function doesn't care where the failure was, only where the string is defined),
 * behaves identically across languages, and fails safe.
 *
 * | Occurrences | Action |
 * |---|---|
 * | 1 | Patch in place |
 * | 0 | Decline — likely a dynamically built selector |
 * | 2+ | Decline — report every location for manual choice |
 */
export function resolvePatch(root: string, brokenSelector: string, extraExcludes: string[] = []): PatchResolution {
  const occurrences = findOccurrences(root, brokenSelector, extraExcludes);

  if (occurrences.length === 0) {
    return { action: 'decline', occurrences, reason: 'no occurrence found — likely a dynamically constructed selector' };
  }
  if (occurrences.length > 1) {
    return { action: 'decline', occurrences, reason: `${occurrences.length} occurrences found — ambiguous, manual choice required` };
  }
  return { action: 'patch', occurrences };
}
