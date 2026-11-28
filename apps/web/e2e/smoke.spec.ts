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

/** The home menu opens on start; these tests play practice on the 9-ball table. */
async function practice(page: Page, game = '9-ball'): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: /^Practice/ }).click();
  await page.getByRole('button', { name: game, exact: true }).click();
}

/** Opens the match set-up from the home menu, against a friend on the same device. */
async function setup(page: Page, game?: string): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: /^Play Game/ }).click();
  if (game) await page.getByRole('button', { name: game, exact: true }).click();
  await page.getByRole('button', { name: 'Friend', exact: true }).click();
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
  await page.getByRole('button', { name: /^Change game/ }).click();
  await page.getByRole('button', { name: 'Snooker', exact: true }).click();
  await expect(page.locator('.status')).toContainText('Snooker');
  const cam = page.getByRole('button', { name: /^Camera/ });
  for (const name of ['Top', 'Free', 'Aim']) {
    await cam.click();
    await expect(cam).toHaveAttribute('aria-label', `Camera: ${name} view`);
  }
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

test('pull-back stroke: letting go cancels, pushing back up strikes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Pull back' }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: /^Practice/ }).click();
  await page.getByRole('button', { name: '9-ball', exact: true }).click();
  await page.waitForFunction(() => window.__cuesports?.state().phase === 'aim');
  const bar = (await page.locator('.power').boundingBox())!;
  const x = bar.x + bar.width / 2;
  // Pull back and let go: no shot.
  await page.mouse.move(x, bar.y + 10);
  await page.mouse.down();
  await page.mouse.move(x, bar.y + bar.height * 0.4, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__cuesports.state().phase)).toBe('aim');
  // Pull back, then push through: a shot.
  await page.mouse.move(x, bar.y + 10);
  await page.mouse.down();
  await page.mouse.move(x, bar.y + bar.height * 0.4, { steps: 6 });
  await page.mouse.move(x, bar.y + 5, { steps: 3 });
  await page.mouse.up();
  await page.waitForFunction(() => window.__cuesports.state().phase !== 'aim', null, { timeout: 10_000 });
});

test('plays a 9-ball match: setup, break, then the rules decide whose turn it is', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setup(page);
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

test('plays 10-ball: after the break the shot is called automatically from the aim', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setup(page, '10-Ball');
  await page.getByRole('button', { name: 'Start' }).click();
  const balls = await page.evaluate(() => window.__cuesports.state().balls.filter((b) => b.id !== 'cue'));
  expect(balls).toHaveLength(10);

  await page.evaluate(() => window.__cuesports.shoot(0.9));
  await page.waitForFunction(() => window.__cuesports.state().phase === 'playing', null, { timeout: 30_000 });
  await page.evaluate(() => window.__cuesports.fastForward());
  await page.waitForFunction(() => window.__cuesports.state().phase === 'aim', null, { timeout: 30_000 });
  const m = await page.evaluate(() => window.__cuesports.state().match!);
  expect(m.turn.isBreak).toBe(false);
  // Unless the break fouled (ball in hand) the next shot must be called, and the chip shows the call.
  if (m.turn.ballInHand === 'none') {
    await expect(page.getByRole('button', { name: 'Called shot' })).toBeVisible();
    await page.getByRole('button', { name: 'Called shot' }).click();
    await expect(page.locator('.pick-bar')).toBeVisible();
    await page.getByRole('button', { name: 'Safety' }).click();
    await expect(page.getByRole('button', { name: 'Called shot' })).toHaveText('Call: safety');
  }
  expect(errors).toEqual([]);
});

test('plays snooker: break-off from the D, then the scoreboard shows points and what is on', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setup(page, 'Snooker');
  await page.getByText('Rules', { exact: true }).click();
  await page.getByRole('group', { name: 'Reds' }).getByRole('button', { name: '6' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  const balls = await page.evaluate(() =>
    window.__cuesports.state().balls.filter((b) => b.id.startsWith('red')),
  );
  expect(balls).toHaveLength(6);
  await expect(page.locator('.scoreboard')).toContainText('left');
  const start = await page.evaluate(() => window.__cuesports.state().match!);
  expect(start.turn.ballInHand).toBe('in-d');

  await page.evaluate(() => window.__cuesports.shoot(0.4));
  await page.waitForFunction(() => window.__cuesports.state().phase === 'playing', null, { timeout: 30_000 });
  await page.evaluate(() => window.__cuesports.fastForward());
  await page.waitForFunction(() => window.__cuesports.state().phase === 'aim', null, { timeout: 30_000 });
  const after = await page.evaluate(() => window.__cuesports.state().match!);
  expect(after.message).not.toMatch(/\{p\d\}/);
  expect(errors).toEqual([]);
});

test('plays English pool: International rules break from baulk', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setup(page, 'UK 8-Ball');
  await page.getByText('Rules', { exact: true }).click();
  await expect(page.getByRole('group', { name: 'Rules' })).toBeVisible();
  await page.getByRole('button', { name: 'Start' }).click();
  const balls = await page.evaluate(() => window.__cuesports.state().balls.map((b) => b.id));
  expect(balls).toContain('8');
  expect(balls.filter((id) => id.startsWith('r'))).toHaveLength(7);
  await page.evaluate(() => window.__cuesports.shoot(0.9));
  await page.waitForFunction(() => window.__cuesports.state().phase === 'playing', null, { timeout: 30_000 });
  await page.evaluate(() => window.__cuesports.fastForward());
  await page.waitForFunction(() => window.__cuesports.state().phase === 'aim', null, { timeout: 30_000 });
  const after = await page.evaluate(() => window.__cuesports.state().match!);
  expect(after.message).not.toMatch(/\{p\d\}/);
  expect(errors).toEqual([]);
});

test('plays against the computer: it thinks in a worker and takes its own shots', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: /^Play Game/ }).click();
  await page.getByRole('button', { name: 'Computer', exact: true }).click();
  await page.getByRole('button', { name: 'Club', exact: true }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('.scoreboard')).toContainText('CPU (Club)');
  // The human breaks.
  await page.evaluate(() => window.__cuesports.shoot(0.9));
  await page.waitForFunction(() => window.__cuesports.state().phase === 'playing', null, { timeout: 30_000 });
  await page.evaluate(() => window.__cuesports.fastForward());
  await page.waitForFunction(() => window.__cuesports.state().phase === 'aim', null, { timeout: 30_000 });
  // Keep playing until the computer has taken a shot: when it is the computer's turn it must shoot on
  // its own; on the human's turn, play a soft shot.
  let aiShots = 0;
  for (let i = 0; i < 6 && aiShots === 0; i++) {
    const m = await page.evaluate(() => window.__cuesports.state().match!);
    if (m.turn.player === 1) {
      await page.waitForFunction(() => window.__cuesports.state().phase !== 'aim', null, { timeout: 30_000 });
      aiShots++;
    } else {
      await page.evaluate(() => window.__cuesports.shoot(0.3));
    }
    await page.waitForFunction(() => window.__cuesports.state().phase === 'playing', null, {
      timeout: 30_000,
    });
    await page.evaluate(() => window.__cuesports.fastForward());
    await page.waitForFunction(() => window.__cuesports.state().phase === 'aim', null, { timeout: 30_000 });
  }
  expect(aiShots).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('home screen: Quick match starts straight away and the pause menu returns home', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: /^Quick match/ }).click();
  await expect(page.locator('.scoreboard')).toBeVisible();
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: /^Resume/ }).click();
  await expect(page.locator('.menu')).toBeHidden();
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: /^Home/ }).click();
  await expect(page.getByRole('button', { name: /^Quick match/ })).toBeVisible();
  expect(await page.evaluate(() => window.__cuesports.state().match)).toBeNull();
  expect(errors).toEqual([]);
});

test('saves a match, shows its stats and replays its shots', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setup(page);
  await page.getByRole('button', { name: /^Start/ }).click();
  await page.waitForFunction(() => window.__cuesports?.state().phase === 'aim');
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => window.__cuesports.shoot(0.8));
    await page.waitForFunction(() => window.__cuesports.state().phase === 'playing', null, {
      timeout: 30_000,
    });
    await page.evaluate(() => window.__cuesports.fastForward());
    await page.waitForFunction(() => window.__cuesports.state().phase === 'aim', null, { timeout: 30_000 });
    // A decision or ball in hand may follow a foul; the test hook shoots from wherever the cue ball is.
    await page.waitForTimeout(300);
  }

  // Keep the last shot, then leave.
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: /^Save last shot/ }).click();
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: /^Home/ }).click();

  await page.getByRole('button', { name: /^Stats/ }).click();
  await expect(page.locator('.stat-grid .stat').first()).toBeVisible();
  await expect(page.locator('.stat-grid')).toContainText('Pot success');
  await page.getByRole('button', { name: 'Back' }).click();

  await page.getByRole('button', { name: /^Replays/ }).click();
  await expect(page.locator('.saved-row')).toHaveCount(2);
  await page.locator('.saved-row.match .saved-main').click();
  await page.getByRole('button', { name: /^Rack 1/ }).click();
  await expect(page.locator('.replay-bar')).toBeVisible();
  await expect(page.locator('.replay-bar')).toContainText('Shot 1 of 2');
  await page.getByRole('button', { name: 'Play this shot' }).click();
  await page.waitForFunction(() => window.__cuesports.state().phase === 'playing', null, { timeout: 30_000 });
  await page.evaluate(() => window.__cuesports.fastForward());
  await page.waitForFunction(() => window.__cuesports.state().phase === 'aim', null, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Next shot' }).click();
  await expect(page.locator('.replay-bar')).toContainText('Shot 2 of 2');
  await page.getByRole('button', { name: 'Close replay' }).click();
  await expect(page.locator('.saved-row').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('practice: arranges the table and starts the drills', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await practice(page);
  await page.waitForFunction(() => window.__cuesports?.state().phase === 'aim');
  const onTable = () =>
    page.evaluate(() => window.__cuesports.state().balls.filter((b) => b.state !== 'pocketed').length);
  await page.getByRole('button', { name: 'Move cue ball' }).click();
  await expect(page.locator('.editor-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  expect(await onTable()).toBe(1);
  await page.getByRole('button', { name: 'Spot potted' }).click();
  expect(await onTable()).toBe(10);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.editor-bar')).toBeHidden();

  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: /^Change game/ }).click();
  await page.getByRole('button', { name: /^Snooker line-up/ }).click();
  await page.waitForFunction(() => window.__cuesports.state().match?.turn.ballInHand === 'in-d');
  const reds = await page.evaluate(
    () => window.__cuesports.state().balls.filter((b) => b.id.startsWith('red')).length,
  );
  expect(reds).toBe(15);

  // A challenge: the list, then the first one, set up with its goal in the status line.
  // A drill counts as a match, so the pause menu has Home rather than Change game.
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: /^Home/ }).click();
  await page.getByRole('button', { name: /^Practice/ }).click();
  await page.getByRole('button', { name: /^Challenges/ }).click();
  await page.getByRole('button', { name: /^1\. Straight in/ }).click();
  await expect(page.locator('.hud')).toContainText('Straight in · attempt 1 of 3');
  const challengeBalls = await page.evaluate(() =>
    window.__cuesports
      .state()
      .balls.filter((b) => b.state !== 'pocketed')
      .map((b) => b.id),
  );
  expect(challengeBalls.sort()).toEqual(['1', 'cue']);
  expect(errors).toEqual([]);
});

test('customises the player and keeps it', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: /^Player$/ }).click();
  await page.getByRole('button', { name: 'Kenji', exact: true }).click();
  // Rosewood is a career prize; the blue wrap is open from the start.
  await page.getByRole('group', { name: 'Wrap' }).getByRole('button', { name: 'Blue' }).click();
  await page.getByRole('textbox', { name: 'Your name' }).fill('Ann');
  await page.getByRole('textbox', { name: 'Your name' }).press('Enter');
  await page.getByRole('textbox', { name: 'Your name' }).blur();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cuesports.profile') ?? '{}'));
  expect(saved).toMatchObject({ name: 'Ann', look: { hairStyle: 'long' }, cue: { wrap: '#1f3f8a' } });
  // Kept after a reload, and used on the Play screen.
  await page.reload();
  await page.getByRole('button', { name: /^Play Game/ }).click();
  await expect(page.getByRole('textbox', { name: 'Player 1 name' })).toHaveValue('Ann');
  expect(errors).toEqual([]);
});

test('career: meets Old Joe, enters an event and shows the bracket', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: /^Career/ }).click();
  // Old Joe introduces himself the first time.
  await expect(page.getByRole('heading', { name: 'So you want to play' })).toBeVisible();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: "Let's go" }).click();
  // He has a booking for you and a message waiting.
  await expect(page.getByRole('button', { name: 'Take it' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Inbox 1' })).toBeVisible();
  await expect(page.locator('.week-bar')).toContainText('Season 1 · Week 1 of 12');
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  // Only the pub is open at first: anything bigger on the calendar is locked.
  await expect(page.locator('.tiles .tile:not(:disabled)').first()).toContainText('Red Lion');
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  // Joe's booking: a pub event, free.
  await page.getByRole('button', { name: 'Take it' }).click();
  await expect(page.locator('.bracket .slot')).toHaveCount(6);
  // His talk, the target and the walk-on card.
  await expect(page.locator('.joe-target')).toHaveText('Target: make the final');
  await expect(page.locator('.walk-on')).toContainText('You vs');
  await page.getByRole('button', { name: /^Play the semi-final/ }).click();
  await page.waitForFunction(() => window.__cuesports?.state().match?.score.length === 2);
  // Locked items in the customiser until won.
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: /^Home/ }).click();
  await page.getByRole('button', { name: /^Player$/ }).click();
  await expect(page.getByRole('button', { name: /^Maple/ })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('career: training plays with your own reach', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  // Past Old Joe's introduction.
  await page.evaluate(() =>
    localStorage.setItem('cuesports.career', JSON.stringify({ introSeen: true, inbox: [], log: [] })),
  );
  await page.reload();
  await page.getByRole('button', { name: /^Career/ }).click();
  await page.getByRole('button', { name: /^Training/ }).click();
  await page.getByRole('button', { name: /^Cueing: Straight in/ }).click();
  // A starting player can't use the full power bar: the rest of it is shaded.
  await expect(page.locator('.power-cap')).toBeVisible();
  await page.waitForFunction(() => window.__cuesports?.state().phase === 'aim');
  expect(errors).toEqual([]);
});

test('Free pyramid: after the break the player taps any ball to make it the cue ball', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setup(page, 'Pyramid');
  await page.getByRole('button', { name: 'Start' }).click();
  expect(await page.evaluate(() => window.__cuesports.state().match!.turn.cueBall)).toBe('pcue');
  await page.evaluate(() => window.__cuesports.shoot(0.9));
  await page.waitForFunction(() => window.__cuesports.state().phase === 'playing', null, { timeout: 30_000 });
  await page.evaluate(() => window.__cuesports.fastForward());
  await page.waitForFunction(() => window.__cuesports.state().phase === 'aim', null, { timeout: 30_000 });
  const turn = await page.evaluate(() => window.__cuesports.state().match!.turn);
  expect(turn.cueBallChoices?.length).toBeGreaterThan(1);
  const chip = page.locator('.chip.call');
  await expect(chip).toHaveText(/^Cue ball: /);
  await chip.click();
  // No panel covers the table: the chip itself asks for the ball.
  await expect(page.locator('.pick-bar')).toBeHidden();
  await expect(chip).toHaveText('Cue ball: tap a ball');
  if (process.env.SHOT_DIR)
    await page.screenshot({ path: `${process.env.SHOT_DIR}/${test.info().project.name}.png` });
  // Tap a white ball (well clear of the others where possible).
  const target = await page.evaluate(() => {
    const s = window.__cuesports.state();
    const up = s.balls.filter((b) => b.state !== 'pocketed' && b.id !== s.shot.ball);
    const gap = (b: (typeof up)[number]) =>
      Math.min(
        ...s.balls
          .filter((o) => o !== b && o.state !== 'pocketed')
          .map((o) => Math.hypot(o.pos.x - b.pos.x, o.pos.y - b.pos.y)),
      );
    const b = up.sort((a, c) => gap(c) - gap(a))[0]!;
    return { id: b.id, ...window.__cuesports.screenOf(b.pos.x, b.pos.y) };
  });
  await page.mouse.click(target.x, target.y);
  await expect(chip).toHaveText(`Cue ball: ${target.id === 'pcue' ? 'coloured' : target.id.slice(1)}`);
  expect(await page.evaluate(() => window.__cuesports.state().shot.ball)).toBe(target.id);
  expect(errors).toEqual([]);
});
