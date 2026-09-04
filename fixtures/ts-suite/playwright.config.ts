import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 10_000,
  use: {
    trace: 'on', // capture a trace for every run, passing or failing
  },
});
