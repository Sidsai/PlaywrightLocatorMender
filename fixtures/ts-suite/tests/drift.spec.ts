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

test('shadow dom target', async ({ page }) => {
  await page.goto(pathToFileURL(resolve('../pages/shadow-dom.html')).href);
  // The real #save-btn lives inside an open shadow root (see fixtures/pages/
  // shadow-dom.html). This selector deliberately misses it, generating a timeout
  // failure whose trace we then inspect (Task 10) to determine whether the
  // frame-snapshot captures shadow content at all — PRD §9 excludes shadow DOM
  // from v1 unless capture is uniform across bindings.
  await page.locator('#save-btn-RENAMED').click({ timeout: 3000 });
});
