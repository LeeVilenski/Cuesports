import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4175', trace: 'off' },
  webServer: {
    command: 'pnpm build && pnpm preview --port 4175 --strictPort',
    url: 'http://localhost:4175',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'landscape', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
    { name: 'phone-portrait', use: { ...devices['Pixel 7'] } },
  ],
});
