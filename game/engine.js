// Comet Coins game engine: plays the role of the game server. Works in the browser (window.CometEngine) and in Node (require).
// QA never imports this file to check results: tools/verify.js re-implements the rules from docs/RULES.md on its own.
(function (root) {
  const PLAYS = [0.1, 0.2, 0.5, 1, 2, 5, 10];
  const PAYS = { STAR: 80, COMET: 40, PLANET: 24, MOON: 16, ROCK: 8, DUST: 5 };
  const LINES = [[[0, 0], [1, 0], [2, 0]], [[0, 1], [1, 1], [2, 1]], [[0, 2], [1, 2], [2, 2]], [[0, 0], [1, 1], [2, 2]], [[0, 2], [1, 1], [2, 0]]];
  const LINE_NAMES = ['top', 'middle', 'bottom', 'diag-down', 'diag-up'];
  const S = { S: 'STAR', C: 'COMET', P: 'PLANET', M: 'MOON', R: 'ROCK', D: 'DUST', O: 'COIN' };
  // 30 stops per reel. COINs are kept 3+ stops apart, so at most one shows per reel.
  const STRIPS = [
    'DMDPDRMPDDOMRSPRRCRDMDRCODDSMR',
    'RPSDMRDDDDRDMRDOMCDCSRRMDMPOPR',
    'RDRORDMPCMCDSMMODPRDDDRPDMSRDR',
  ].map((s) => [...s].map((c) => S[c]));

  // mulberry32: small seeded PRNG so rounds can be replayed exactly.
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const cents = (x) => Math.floor(x * 100 + 1e-9) / 100;

  function window3(stops) { return stops.map((st, r) => [0, 1, 2].map((k) => STRIPS[r][(st + k) % 30])); } // grid[reel][row]

  function evaluate(grid, stake) {
    const lineBet = stake / 5, lines = [];
    LINES.forEach((pos, i) => {
      const syms = pos.map(([r, row]) => grid[r][row]);
      if (syms.includes('COIN')) return;
      const base = syms.find((s) => s !== 'STAR') || 'STAR';
      if (syms.every((s) => s === base || s === 'STAR')) lines.push({ line: LINE_NAMES[i], symbol: base, pay: PAYS[base] * lineBet });
    });
    const coins = grid.flat().filter((s) => s === 'COIN').length;
    const scatter = coins >= 3 ? 10 * stake : 0;
    const raw = lines.reduce((s, l) => s + l.pay, 0) + scatter;
    return { lines, coins, scatter, totalWin: cents(Math.min(raw, 500 * stake)) };
  }

  function createGame({ seed = 1, balance = 1000 } = {}) {
    const next = rng(seed); let n = 0;
    return {
      get balance() { return balance; },
      play(stake) {
        if (!PLAYS.includes(stake)) return { error: 'INVALID_PLAY' };
        if (stake > balance + 1e-9) return { error: 'INSUFFICIENT_FUNDS' };
        const stops = [0, 1, 2].map(() => Math.floor(next() * 30));
        const grid = window3(stops), res = evaluate(grid, stake);
        const before = balance; balance = Math.round((balance - stake + res.totalWin) * 100) / 100;
        return { roundId: 'R' + String(++n).padStart(5, '0'), seed, stake, stops, grid, ...res, balanceBefore: before, balanceAfter: balance };
      },
    };
  }
  const api = { PLAYS, PAYS, STRIPS, createGame };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CometEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
