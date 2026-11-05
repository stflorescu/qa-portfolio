// Playwright suite for Comet Coins. Each test maps to a section of docs/RULES.md.
// Run: npm test            (all should pass)
//      npm run test:bug    (same suite against a build with a planted display bug: the balance test fails)
const { test, expect } = require('@playwright/test');
const path = require('path');
const { check } = require('../tools/verify.js');

const GAME = 'file:///' + path.resolve(__dirname, '../game/index.html').replace(/\\/g, '/');
const BUG = process.env.BUG ? '&bug=display' : '';
const open = async (page, qs = '') => { await page.goto(`${GAME}?seed=42${qs}${BUG}`); await expect(page.getByRole('button', { name: 'PLAY', exact: true })).toBeEnabled(); };
const num = async (loc) => parseFloat(await loc.textContent());
const balance = (page) => page.getByTestId('balance');
const playRound = async (page) => {
  const n = await page.evaluate(() => window.__rounds.length);
  await page.getByRole('button', { name: 'PLAY', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__rounds.length)).toBe(n + 1);
  await expect(page.getByRole('button', { name: 'PLAY', exact: true })).toBeEnabled(); // round finished
  return page.evaluate(() => window.__rounds[window.__rounds.length - 1]);
};

test.describe('Comet Coins', () => {
  test('§1 loads with the start balance and the lowest play amount', async ({ page }) => {
    await open(page);
    await expect(balance(page)).toHaveText('1000.00');
    await expect(page.getByTestId('amount')).toHaveText('0.10');
    await expect(page.getByRole('status')).toHaveText('Press PLAY to start');
  });

  test('§8 − and + step through every play amount and disable at the ends', async ({ page }) => {
    await open(page);
    const minus = page.getByRole('button', { name: 'Decrease play amount' }), plus = page.getByRole('button', { name: 'Increase play amount' });
    await expect(minus).toBeDisabled();
    const seen = [await page.getByTestId('amount').textContent()];
    while (await plus.isEnabled()) { await plus.click(); seen.push(await page.getByTestId('amount').textContent()); }
    expect(seen).toEqual(['0.10', '0.20', '0.50', '1.00', '2.00', '5.00', '10.00']);
    await expect(plus).toBeDisabled();
    await expect(minus).toBeEnabled();
  });

  test('§8 controls are locked while a round plays', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'PLAY', exact: true }).click();
    await expect(page.getByRole('button', { name: 'PLAY', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Increase play amount' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'PLAY', exact: true })).toBeEnabled({ timeout: 3000 });
  });

  test('§7 balance after every round = before − play + win (20 rounds, mixed amounts)', async ({ page }) => {
    await open(page);
    for (let i = 0; i < 20; i++) {
      if (i % 5 === 0) await page.getByRole('button', { name: 'Increase play amount' }).click();
      const before = await num(balance(page));
      const r = await playRound(page);
      expect(r.balanceBefore, `${r.roundId} starts from the shown balance`).toBeCloseTo(before, 2);
      await expect(balance(page), `${r.roundId} shown balance`).toHaveText((before - r.stake + r.totalWin).toFixed(2));
    }
  });

  test('§3–§7 every round the server returns re-verifies independently (100 rounds)', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { const g = CometEngine.createGame({ seed: 7, balance: 1000 }); for (let i = 0; i < 100; i++) window.__rounds.push(g.play(1)); });
    const rounds = await page.evaluate(() => window.__rounds);
    const problems = rounds.flatMap((r) => check(r).map((p) => `${r.roundId}: ${p}`));
    expect(problems).toEqual([]);
  });

  test('§7 a play larger than the balance is refused with no round and no debit', async ({ page }) => {
    await open(page, '&balance=0.05');
    await page.getByRole('button', { name: 'PLAY', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Not enough credits');
    await expect(balance(page)).toHaveText('0.05');
    expect(await page.evaluate(() => window.__rounds.length)).toBe(0);
  });

  test('§8 history lists the last rounds, newest first, with the right wins', async ({ page }) => {
    await open(page);
    const played = [];
    for (let i = 0; i < 12; i++) played.push(await playRound(page));
    const items = page.getByTestId('history').locator('li');
    await expect(items).toHaveCount(10);
    for (let i = 0; i < 10; i++) {
      const r = played[played.length - 1 - i];
      await expect(items.nth(i)).toHaveAttribute('data-round', r.roundId);
      await expect(items.nth(i)).toContainText(r.totalWin > 0 ? '+' + r.totalWin.toFixed(2) : '0.00');
    }
  });

  test('§1 nothing on screen uses gambling wording ("bet", "wager", "cash")', async ({ page }) => {
    await open(page);
    const text = (await page.locator('body').innerText()).toLowerCase();
    expect(text).not.toMatch(/\b(bet|bets|betting|wager|cash)\b/);
  });
});
