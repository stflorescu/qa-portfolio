#!/usr/bin/env node
// Statistics for Comet Coins.
// 1. Exact model: enumerates all 30³ = 27,000 stop combinations from the rules → exact RTP, hit rate, Coin Burst odds.
// 2. Observed: compares a captured session against the model (z-scores, chi-square on reel stops).
//
//   node tools/stats.js data/rounds.json
const fs = require('fs');
const { expected, STRIPS } = require('./verify.js');

function exactModel() {
  const n = STRIPS[0].length; let sum = 0, sumSq = 0, hits = 0, bursts = 0, max = 0;
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) for (let c = 0; c < n; c++) {
    const e = expected([a, b, c], 1);            // per 1 credit of stake
    sum += e.totalWin; sumSq += e.totalWin ** 2; if (e.totalWin > 0) hits++; if (e.scatter) bursts++; if (e.totalWin > max) max = e.totalWin;
  }
  const N = n ** 3, rtp = sum / N;
  return { combos: N, rtp, sd: Math.sqrt(sumSq / N - rtp ** 2), hitRate: hits / N, burstRate: bursts / N, maxWinX: max };
}

// Regularised lower incomplete gamma → chi-square p-value.
function gammaln(x) { const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (const k of c) s += k / ++y; return -t + Math.log(2.5066282746310005 * s / x); }
function gammap(a, x) {
  if (x <= 0) return 0;
  if (x < a + 1) { let sum = 1 / a, del = sum, ap = a; for (let i = 0; i < 200; i++) { del *= x / ++ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-12) break; } return sum * Math.exp(-x + a * Math.log(x) - gammaln(a)); }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d; for (let i = 1; i < 200; i++) { const an = -i * (i - a); b += 2; d = an * d + b; d = 1 / d; c = b + an / c; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-12) break; }
  return 1 - Math.exp(-x + a * Math.log(x) - gammaln(a)) * h;
}
const chiP = (chi, df) => 1 - gammap(df / 2, chi / 2);

function observed(rounds, model) {
  const N = rounds.length, staked = rounds.reduce((s, r) => s + r.stake, 0), won = rounds.reduce((s, r) => s + r.totalWin, 0);
  const hits = rounds.filter((r) => r.totalWin > 0).length, bursts = rounds.filter((r) => r.scatter > 0).length;
  const z = (obs, p) => (obs - N * p) / Math.sqrt(N * p * (1 - p));
  // Stops should be uniform on every reel: chi-square with 29 degrees of freedom per reel.
  const reels = [0, 1, 2].map((r) => {
    const n = STRIPS[r].length, counts = Array(n).fill(0); rounds.forEach((x) => counts[x.stops[r]]++);
    const e = N / n, chi = counts.reduce((s, c) => s + (c - e) ** 2 / e, 0);
    return { reel: r + 1, chi: +chi.toFixed(2), df: n - 1, p: +chiP(chi, n - 1).toFixed(3) };
  });
  // RTP: stakes vary, so compare return per credit against the exact model with its SD.
  const rtp = won / staked, rtpZ = (rtp - model.rtp) / (model.sd / Math.sqrt(N));
  return { rounds: N, staked: +staked.toFixed(2), won: +won.toFixed(2), rtp, rtpZ, hitRate: hits / N, hitZ: z(hits, model.hitRate), bursts, burstZ: z(bursts, model.burstRate), reels };
}

module.exports = { exactModel, observed, chiP };

if (require.main === module) {
  const m = exactModel();
  console.log(`Exact model (${m.combos.toLocaleString()} combinations): RTP ${(m.rtp * 100).toFixed(3)}%, hit rate ${(m.hitRate * 100).toFixed(2)}%, Coin Burst 1 in ${(1 / m.burstRate).toFixed(1)}, SD ${m.sd.toFixed(3)}× stake, max ${m.maxWinX}× stake`);
  const file = process.argv[2];
  if (file) {
    const o = observed(JSON.parse(fs.readFileSync(file, 'utf8')), m);
    console.log(`Observed over ${o.rounds} rounds: RTP ${(o.rtp * 100).toFixed(2)}% (z ${o.rtpZ.toFixed(2)}), hit rate ${(o.hitRate * 100).toFixed(2)}% (z ${o.hitZ.toFixed(2)}), Coin Bursts ${o.bursts} (z ${o.burstZ.toFixed(2)})`);
    for (const r of o.reels) console.log(`  reel ${r.reel} stops uniform? chi² ${r.chi} on ${r.df} df, p = ${r.p}`);
    console.log('Rule of thumb: |z| < 3 and p > 0.01 → consistent with the model. Pool 250+ rounds before flagging anything.');
  }
}
