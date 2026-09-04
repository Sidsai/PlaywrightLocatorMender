/**
 * The supported Playwright version range, enforced at ingest time and named in
 * the README (Task 69). Floor is 1.48.0 (the oldest committed fixture trace,
 * Java's — D-016); ceiling is generous since the trace shape has been stable
 * across every binding/version tested (D-014/D-015/D-016/D-017) but the format
 * carries no compatibility guarantee (TRD §2), so an explicit ceiling exists
 * rather than assuming forward compatibility indefinitely.
 */
export const SUPPORTED_PLAYWRIGHT_RANGE = { min: '1.48.0', max: '1.99.99' };

function parseVersion(v: string): [number, number, number] {
  const [major, minor, patch] = v.split('.').map((n) => parseInt(n, 10) || 0);
  return [major, minor, patch];
}

function compareVersions(a: string, b: string): number {
  const [aMaj, aMin, aPat] = parseVersion(a);
  const [bMaj, bMin, bPat] = parseVersion(b);
  if (aMaj !== bMaj) return aMaj - bMaj;
  if (aMin !== bMin) return aMin - bMin;
  return aPat - bPat;
}

export function isVersionSupported(version: string): boolean {
  return (
    compareVersions(version, SUPPORTED_PLAYWRIGHT_RANGE.min) >= 0 &&
    compareVersions(version, SUPPORTED_PLAYWRIGHT_RANGE.max) <= 0
  );
}
