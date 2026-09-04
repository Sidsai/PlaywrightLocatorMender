import { test } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

// Both tests are DELIBERATELY FAILING. They exist to generate real trace.zip files
// for the M0 spike, not to pass — see AI/DECISION.md D-003 and spike/README.md.

test('saves the form', async ({ page }) => {
  await page.goto(pathToFileURL(resolve('../pages/semantic.html')).href);
  // #save-btn was renamed on the page but the test still looks for the old id —
  // this is the "timeout" failureKind (locator drift, TRD §3).
  await page.locator('#save-btn-RENAMED').click({ timeout: 3000 });
});

test('strict mode violation', async ({ page }) => {
  await page.goto(pathToFileURL(resolve('../pages/data-grid.html')).href);
  // Matches all 40 row-action buttons — this is the "strict_violation" failureKind.
  await page.locator('button.row-action').click({ timeout: 3000 });
});
