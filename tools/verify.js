#!/usr/bin/env node
// Independent verifier for Comet Coins.
// Written from docs/RULES.md only; it does NOT import game/engine.js. It re-derives every round
// from the stops in the payload and compares each field with what the "server" returned.
//
//   node tools/verify.js data/rounds.json            → every round re-checked
//   node tools/verify.js data/rounds-tampered.json   → shows the verifier catching a planted error
const fs = require('fs');

// ---- Rules, transcribed from docs/RULES.md ----
const LETTER = { S: 'STAR', C: 'COMET', P: 'PLANET', M: 'MOON', R: 'ROCK', D: 'DUST', O: 'COIN' };
const STRIPS = ['DMDPDRMPDDOMRSPRRCRDMDRCODDSMR', 'RPSDMRDDDDRDMRDOMCDCSRRMDMPOPR', 'RDRORDMPCMCDSMMODPRDDDRPDMSRDR'].map((s) => [...s].map((c) => LETTER[c]));
const PAYS = { STAR: 80, COMET: 40, PLANET: 24, MOON: 16, ROCK: 8, DUST: 5 }; // × line bet (§4)
const PLAYS = [0.1, 0.2, 0.5, 1, 2, 5, 10];                                     // §1
const LINES = { top: [0, 0, 0], middle: [1, 1, 1], bottom: [2, 2, 2], 'diag-down': [0, 1, 2], 'diag-up': [2, 1, 0] }; // row per reel (§3)
const SCATTER_X = 10, CAP_X = 500;                                                // §5, §7

const floorCents = (x) => Math.floor(x * 100 + 1e-9) / 100;
const close = (a, b) => Math.abs(a - b) < 0.005;

/** Expected outcome of one round, from its stops and play amount. */
function expected(stops, stake) {
  const grid = stops.map((st, r) => [0, 1, 2].map((k) => STRIPS[r][(st + k) % STRIPS[r].length]));
  const lineBet = stake / 5, lines = [];
  for (const [name, rows] of Object.entries(LINES)) {
    const syms = rows.map((row, reel) => grid[reel][row]);
    if (syms.includes('COIN')) continue;                       // COIN never pays on a line
    const nonWild = syms.filter((s) => s !== 'STAR');
    const sym = nonWild.length ? nonWild[0] : 'STAR';            // three STARs pay as STAR
    if (nonWild.every((s) => s === sym)) lines.push({ line: name, symbol: sym, pay: PAYS[sym] * lineBet });
  }
  const coins = grid.flat().filter((s) => s === 'COIN').length;
  const scatter = coins >= 3 ? SCATTER_X * stake : 0;
  const raw = lines.reduce((s, l) => s + l.pay, 0) + scatter;
  return { grid, lines, coins, scatter, totalWin: floorCents(Math.min(raw, CAP_X * stake)) };
}

/** Compare one server round with the expected outcome. Returns a list of problems (empty = match). */
function check(round) {
  const p = [];
  if (!PLAYS.includes(round.stake)) p.push(`play amount ${round.stake} is not allowed`);
  const e = expected(round.stops, round.stake);
  if (JSON.stringify(e.grid) !== JSON.stringify(round.grid)) p.push('grid does not match the stops');
  const key = (ls) => ls.map((l) => `${l.line}:${l.symbol}:${l.pay.toFixed(4)}`).sort().join(',');
  if (key(e.lines) !== key(round.lines)) p.push(`line wins differ: expected [${key(e.lines)}] got [${key(round.lines)}]`);
  if (e.coins !== round.coins || !close(e.scatter, round.scatter)) p.push(`Coin Burst differs: expected ${e.coins} coins / ${e.scatter}, got ${round.coins} / ${round.scatter}`);
  if (!close(e.totalWin, round.totalWin)) p.push(`total win differs: expected ${e.totalWin}, got ${round.totalWin}`);
  const bal = Math.round((round.balanceBefore - round.stake + e.totalWin) * 100) / 100;
  if (!close(bal, round.balanceAfter)) p.push(`balance differs: expected ${bal}, got ${round.balanceAfter}`);
  return p;
}

/** Check a whole session, including that each round starts from the previous balance. */
function verifyAll(rounds) {
  const bad = [];
  rounds.forEach((r, i) => {
    const p = check(r);
    if (i > 0 && !close(rounds[i - 1].balanceAfter, r.balanceBefore)) p.push(`balance drift: previous round ended at ${rounds[i - 1].balanceAfter}, this one starts at ${r.balanceBefore}`);
    if (p.length) bad.push({ roundId: r.roundId, problems: p });
  });
  return { total: rounds.length, mismatches: bad.length, bad };
}

module.exports = { expected, check, verifyAll, STRIPS, PAYS, LINES, PLAYS };

if (require.main === module) {
  const file = process.argv[2] || 'data/rounds.json';
  const rounds = JSON.parse(fs.readFileSync(file, 'utf8'));
  const res = verifyAll(rounds);
  console.log(`${file}: ${res.total} rounds re-derived from the rules, ${res.mismatches} mismatch${res.mismatches === 1 ? '' : 'es'}`);
  for (const b of res.bad.slice(0, 10)) console.log(`  ✗ ${b.roundId}\n    - ${b.problems.join('\n    - ')}`);
  process.exitCode = res.mismatches ? 1 : 0;
}
