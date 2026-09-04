/**
 * Wilson score interval upper bound at 95% confidence (z = 1.96). This — not the
 * point estimate — is what "false-repair rate <= 3%" means (PRD §8, D-011). A point
 * estimate can look compliant at low sample sizes while the true rate sits well
 * above the target; the upper bound is what makes the claim honest.
 */
export function wilsonUpper(failures: number, total: number, z = 1.96): number {
  if (total <= 0) return 0;
  const p = failures / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total));
  return (centre + margin) / denom;
}
