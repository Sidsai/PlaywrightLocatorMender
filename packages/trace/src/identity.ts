import { existsSync, readFileSync } from 'node:fs';
import type { TestIdentity } from './events.js';

export interface IdentityInput {
  traceTitle?: string;
}

export interface IdentityHooks {
  /** Reads a sidecar JSON file next to the trace, if one exists. Injectable for tests. */
  readSidecar?: (tracePath: string) => { testIdentity?: string } | undefined;
}

export interface IdentityResult {
  identity?: TestIdentity;
  source: 'title' | 'sidecar' | 'filename' | 'none';
}

const FILENAME_PATTERN = /([A-Za-z0-9_]+#[A-Za-z0-9_]+)\.zip$/;

function defaultReadSidecar(tracePath: string): { testIdentity?: string } | undefined {
  const sidecarPath = tracePath.replace(/\.zip$/, '.json');
  if (!existsSync(sidecarPath)) return undefined;
  try {
    return JSON.parse(readFileSync(sidecarPath, 'utf8'));
  } catch {
    return undefined;
  }
}

/**
 * Resolves Java test identity via the precedence order confirmed at M0 (D-008,
 * D-016): trace title (set via Tracing.StartOptions.setTitle, confirmed to survive
 * into the trace verbatim) > sidecar JSON > filename convention
 * (traces/<Class>#<method>.zip) > none.
 *
 * TS and Python don't need this — their runners auto-populate traceTitle for free
 * (D-014, D-015) — but the same precedence order applies uniformly; it just resolves
 * at the first tier for those bindings in practice.
 */
export function resolveIdentity(
  input: IdentityInput,
  tracePath: string,
  hooks: IdentityHooks = {},
): IdentityResult {
  if (input.traceTitle) {
    return { source: 'title', identity: { raw: input.traceTitle, source: 'title' } };
  }

  const readSidecar = hooks.readSidecar ?? defaultReadSidecar;
  const sidecar = readSidecar(tracePath);
  if (sidecar?.testIdentity) {
    return { source: 'sidecar', identity: { raw: sidecar.testIdentity, source: 'sidecar' } };
  }

  const match = tracePath.match(FILENAME_PATTERN);
  if (match) {
    return { source: 'filename', identity: { raw: match[1], source: 'filename' } };
  }

  return { source: 'none' };
}
