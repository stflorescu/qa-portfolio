#!/usr/bin/env node
// Plays a sample session on the engine (the "server") and saves the payloads, the way a capture
// of real /play responses would look. Also writes a copy with ONE planted error, to prove the verifier catches it.
//
//   node tools/generate-rounds.js [rounds=5000] [seed=2026]
const fs = require('fs'), path = require('path');
const { createGame, PLAYS } = require('../game/engine.js');
const N = +(process.argv[2] || 5000), seed = +(process.argv[3] || 2026);
const game = createGame({ seed, balance: 10000 });
const pick = (i) => PLAYS[[0, 0, 1, 2, 3, 3, 4, 5, 6][i % 9]]; // a mix of play amounts, mostly small
const rounds = [];
for (let i = 0; i < N; i++) { const r = game.play(pick(i)); if (r.error) break; rounds.push(r); }
const dir = path.join(__dirname, '..', 'data'); fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'rounds.json'), JSON.stringify(rounds));
// Planted error: one winning round overpays by one cent, a classic rounding bug.
const t = JSON.parse(JSON.stringify(rounds)); const k = t.findIndex((r, i) => i > 1000 && r.lines.length > 0);
t[k].totalWin = +(t[k].totalWin + 0.01).toFixed(2); t[k].balanceAfter = +(t[k].balanceAfter + 0.01).toFixed(2);
for (let i = k + 1; i < t.length; i++) { t[i].balanceBefore = +(t[i].balanceBefore + 0.01).toFixed(2); t[i].balanceAfter = +(t[i].balanceAfter + 0.01).toFixed(2); }
fs.writeFileSync(path.join(dir, 'rounds-tampered.json'), JSON.stringify(t));
console.log(`Saved ${rounds.length} rounds (seed ${seed}) → data/rounds.json; planted a +0.01 overpay in ${t[k].roundId} → data/rounds-tampered.json`);
