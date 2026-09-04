import { readFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';

/**
 * Opens a Playwright trace.zip archive defensively. Every failure mode — a missing
 * file, a corrupt archive, a file that isn't a zip at all — collapses to the same
 * clear error rather than a raw stack trace, per TRD §2's parsing mitigation.
 */
export function openTrace(path: string): Map<string, Uint8Array> {
  let raw: Uint8Array;
  try {
    raw = readFileSync(path);
  } catch (e) {
    throw new Error(`not a readable trace archive: ${path} (${(e as Error).message})`);
  }
  try {
    return new Map(Object.entries(unzipSync(raw)));
  } catch (e) {
    throw new Error(`not a readable trace archive: ${path} (${(e as Error).message})`);
  }
}

export function readText(entries: Map<string, Uint8Array>, name: string): string | undefined {
  const buf = entries.get(name);
  return buf ? strFromU8(buf) : undefined;
}
