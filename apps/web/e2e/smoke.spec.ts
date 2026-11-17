import { expect, test, type Page } from '@playwright/test';

interface Api {
  shoot(p: number): void;
  fastForward(): void;
  state(): {
    phase: string;
    balls: { id: string; state: string }[];
    match: {
      score: number[];
      turn: { player: number; ballInHand: string; isBreak: boolean };
      message: string;
    } | null;
  };
  setCamera(mode: 'aim' | 'top' | 'free'): void;
}
declare global {
  interface Window {
    __cuesports: Api;
  }
}

/** The new-match sheet opens on start; these tests play practice, so close it. */
async function practice(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Cancel' }).click();
}

test('loads the 3D table, plays a shot and returns to aiming', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await practice(page);
  await expect(page.locator('canvas[aria-label=Table]')).toBeVisible();
  await expect(page.locator('.power')).toBeVisible();
  await page.waitForFunction(() => window.__cuesports?.state().phase === 'aim');

  await page.evaluate(() => window.__cuesports.shoot(0.7));
  await page.waitForFunction(() => window.__cuesports.state().phase === 'playing', null, { timeout: 30_000 });
  await page.evaluate(() => window.__cuesports.fastForward());
  await page.waitForFunction(() => window.__cuesports.state().phase === 'aim', null, { timeout: 30_000 });
  // Every ball is either on the table at rest or in a pocket.
  const states = await page.evaluate(() => window.__cuesports.state().balls.map((b) => b.state));
  expect(states.every((s) => s === 'stationary' || s === 'pocketed')).toBe(true);
  expect(errors).toEqual([]);
});

test('switches games and cameras from the menu', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await practice(page);
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByLabel('Game').selectOption('snooker');
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.status')).toContainText('Snooker');
  for (const name of ['Top', 'Free', 'Aim']) await page.getByRole('button', { name, exact: true }).click();
  const ids = await page.evaluate(() => window.__cuesports.state().balls.map((b) => b.id));
  expect(ids).toContain('black');
  expect(errors).toEqual([]);
});

test('pulling the power bar down and releasing takes a shot', async ({ page }) => {
  await practice(page);
  await page.waitForFunction(() => window.__cuesports?.state().phase === 'aim');
  const bar = (await page.locator('.power').boundingBox())!;
  const x = bar.x + bar.width / 2;
  await page.mouse.move(x, bar.y + 10);
  await page.mouse.down();
  await page.mouse.move(x, bar.y + bar.height * 0.5, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => window.__cuesports.state().phase !== 'aim', null, { timeout: 10_000 });
});

test('plays a 9-ball match: setup, break, then the rules decide whose turn it is', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByLabel('Player 1 name').fill('Ann');
  await page.getByLabel('Player 2 name').fill('Bo');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('.scoreboard')).toContainText('Ann');
  await expect(page.locator('.scoreboard')).toContainText('Bo');
  const start = await page.evaluate(() => window.__cuesports.state().match!);
  expect(start.turn).toMatchObject({ player: 0, isBreak: true, ballInHand: 'behind-head-string' });

  await page.evaluate(() => window.__cuesports.shoot(0.9));
  await page.waitForFunction(() => window.__cuesports.state().phase === 'playing', null, { timeout: 30_000 });
  await page.evaluate(() => window.__cuesports.fastForward());
  await page.waitForFunction(() => window.__cuesports.state().phase === 'aim', null, { timeout: 30_000 });
  const after = await page.evaluate(() => window.__cuesports.state().match!);
  expect(after.turn.isBreak).toBe(false);
  expect(after.message).not.toMatch(/\{p\d\}/);
  await expect(page.locator('.toast')).toBeVisible();
  expect(errors).toEqual([]);
});
