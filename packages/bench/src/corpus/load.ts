import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export interface CorpusManifestEntry {
  id: string;
  app: string;
  url: string;
  licence: string;
  idiom: string;
  capturedAt: string;
  sha256: string;
}

export interface CorpusManifest {
  entries: CorpusManifestEntry[];
}

/**
 * Loads one frozen corpus entry, verifying its sha256 against the manifest first.
 * A silently edited fixture must fail loudly (PRD §9 / D-009: the corpus is frozen
 * and committed — an entry that no longer matches its recorded hash is not the
 * corpus that was frozen, and using it silently would break reproducibility across
 * runs, which is the entire reason the corpus is committed rather than fetched live).
 */
export function loadCorpusEntry(dir: string, id: string): unknown {
  const manifest: CorpusManifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8'));
  const entry = manifest.entries.find((e) => e.id === id);
  if (!entry) {
    throw new Error(`corpus entry not found in manifest: ${id}`);
  }

  const raw = readFileSync(`${dir}/${id}.json`, 'utf8');
  const actualSha256 = createHash('sha256').update(raw).digest('hex');
  if (actualSha256 !== entry.sha256) {
    throw new Error(
      `corpus entry "${id}" failed sha256 checksum verification — the file may have ` +
        `been tampered with or silently edited (expected ${entry.sha256}, got ${actualSha256})`,
    );
  }

  return JSON.parse(raw);
}

export function listCorpusEntries(dir: string): CorpusManifestEntry[] {
  const manifest: CorpusManifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8'));
  return manifest.entries;
}
