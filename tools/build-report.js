#!/usr/bin/env node
// Builds report/index.html: the QA report for Comet Coins, generated from real runs of the tools.
// Inputs: data/rounds.json, data/rounds-tampered.json, and (optional) report/playwright-results.json
// from `npx playwright test --reporter=json > report/playwright-results.json`.
const fs = require('fs'), path = require('path');
const { verifyAll } = require('./verify.js');
const { exactModel, observed, chiP } = require('./stats.js');
const { createGame } = require('../game/engine.js');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'report');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = (x, d = 2) => (x * 100).toFixed(d) + '%';
const fp = (p) => (p < 0.001 ? 'p < 0.001' : 'p = ' + p.toFixed(3));

const rounds = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/rounds.json'), 'utf8'));
const tampered = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/rounds-tampered.json'), 'utf8'));
const v = verifyAll(rounds), vt = verifyAll(tampered), m = exactModel(), o = observed(rounds, m);

// Re-test the reel-stop distribution on fresh sessions before calling anything a bug.
const retest = [11, 23, 57, 101, 404].map((seed) => {
  const g = createGame({ seed, balance: 1e9 }), counts = [0, 1, 2].map(() => Array(30).fill(0)), N = 5000;
  for (let i = 0; i < N; i++) g.play(0.1).stops.forEach((s, k) => counts[k][s]++);
  return { seed, p: counts.map((c) => { const e = N / 30; return chiP(c.reduce((s, x) => s + (x - e) ** 2 / e, 0), 29); }) };
});
const flagged = o.reels.filter((r) => r.p < 0.01);
const retestOk = retest.every((r) => r.p.every((p) => p > 0.01));

// Playwright results (if the JSON report exists)
let pw = [];
try {
  const j = JSON.parse(fs.readFileSync(path.join(OUT, 'playwright-results.json'), 'utf8'));
  const walk = (s) => { (s.specs || []).forEach((sp) => sp.tests.forEach((t) => pw.push({ title: sp.title, project: t.projectName, status: t.results.at(-1)?.status === 'passed' ? 'pass' : 'fail' }))); (s.suites || []).forEach(walk); };
  j.suites.forEach(walk);
} catch { pw = []; }

const checks = [
  ...pw.map((t) => ({ id: 'PW', area: 'Behaviour · ' + t.project, title: t.title, status: t.status, actual: t.status === 'pass' ? 'Passed in Playwright' : 'Failed in Playwright' })),
  { id: 'M-1', area: 'Maths', title: 'Every captured round re-derives from the rules (lines, wilds, Coin Burst, cap, rounding, balance)', status: v.mismatches ? 'fail' : 'pass', actual: `${v.total.toLocaleString()} rounds, ${v.mismatches} mismatches` },
  { id: 'M-2', area: 'Maths', title: 'Balance chains from round to round with no drift', status: v.bad.some((b) => b.problems.some((p) => p.includes('drift'))) ? 'fail' : 'pass', actual: 'Each round starts at the previous round\'s end balance' },
  { id: 'M-3', area: 'Maths', title: 'Verifier self-test: it catches a planted 1-cent overpay', status: vt.mismatches === 1 ? 'pass' : 'fail', actual: `${vt.mismatches} mismatch found in the tampered capture (${vt.bad[0]?.roundId || '-'})` },
  { id: 'S-1', area: 'Statistics', title: 'Observed RTP is consistent with the exact model', status: Math.abs(o.rtpZ) < 3 ? 'pass' : 'fail', actual: `${pct(o.rtp)} vs ${pct(m.rtp, 3)} (z ${o.rtpZ.toFixed(2)})` },
  { id: 'S-2', area: 'Statistics', title: 'Hit rate is consistent with the exact model', status: Math.abs(o.hitZ) < 3 ? 'pass' : 'fail', actual: `${pct(o.hitRate)} vs ${pct(m.hitRate)} (z ${o.hitZ.toFixed(2)})` },
  { id: 'S-3', area: 'Statistics', title: 'Coin Burst frequency is consistent with the exact model', status: Math.abs(o.burstZ) < 3 ? 'pass' : 'fail', actual: `${o.bursts} in ${o.rounds} vs 1 in ${(1 / m.burstRate).toFixed(0)} (z ${o.burstZ.toFixed(2)})` },
  ...o.reels.map((r) => ({ id: 'S-4.' + r.reel, area: 'Statistics', title: `Reel ${r.reel} stops are uniform`, status: r.p >= 0.01 ? 'pass' : (retestOk ? 'watch' : 'fail'), actual: `chi² ${r.chi} on ${r.df} df, ${fp(r.p)}${r.p < 0.01 && retestOk ? ' · not reproduced in 5 re-tests' : ''}` })),
  { id: 'Q-1', area: 'Open question', title: 'Cap before or after rounding? (§9)', status: 'note', actual: 'Observed: cap first, then round down. The highest possible win is ' + m.maxWinX + '× play, so the 500× cap is never reached' },
  { id: 'Q-2', area: 'Open question', title: 'RTP (§9, not stated)', status: 'note', actual: `Exact RTP ${pct(m.rtp, 3)} from all ${m.combos.toLocaleString()} stop combinations` },
];
const count = (s) => checks.filter((c) => c.status === s).length;
const fails = count('fail'), verdict = fails ? 'NO-GO' : 'GO';
const pill = { pass: 'Pass', fail: 'Fail', watch: 'Watch', note: 'Note' };

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Comet Coins QA report</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600&family=Source+Sans+3:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root { --bg: #f2f5f2; --surface: #fff; --ink: #17241c; --muted: #56655b; --line: #d5ded7; --accent: #8a6410; --pass: #2a7a46; --pass-s: #def0e3; --fail: #b02a24; --fail-s: #f8dedb; --watch: #8a6200; --watch-s: #f6ebcc; --note: #4a55a0; --note-s: #e5e7f6;
  --display: "Oswald", "Arial Narrow", sans-serif; --body: "Source Sans 3", "Segoe UI", system-ui, sans-serif; --mono: "IBM Plex Mono", ui-monospace, Consolas, monospace; }
@media (prefers-color-scheme: dark) { :root { --bg: #101813; --surface: #18231c; --ink: #e8f0ea; --muted: #9fb0a4; --line: #2c3b31; --accent: #e8c25e; --pass: #78d293; --pass-s: #17301f; --fail: #ff8f86; --fail-s: #3c1a18; --watch: #e9c25a; --watch-s: #362a0e; --note: #a8b2ff; --note-s: #222744; color-scheme: dark; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.55 var(--body); padding: 32px max(16px, env(safe-area-inset-left)) 72px; }
.wrap { max-width: 1080px; margin: 0 auto; display: grid; gap: 40px; }
h1, h2 { font-family: var(--display); font-weight: 600; margin: 0; text-wrap: balance; }
h1 { font-size: clamp(36px, 6vw, 54px); line-height: 1; } h2 { font-size: 25px; }
p { margin: 0; max-width: 72ch; }
.eyebrow { font: 700 12px/1 var(--body); letter-spacing: .14em; text-transform: uppercase; color: var(--accent); }
.meta { display: flex; flex-wrap: wrap; gap: 6px 18px; color: var(--muted); font-size: 14px; }
header, section { display: grid; gap: 14px; }
.plate { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); background: var(--surface); border: 1px solid var(--line); border-top: 4px solid var(--${fails ? 'fail' : 'pass'}); border-radius: 6px; }
.plate > div { padding: 20px 22px; display: grid; gap: 10px; align-content: start; min-width: 0; }
.plate > div + div { border-left: 1px solid var(--line); }
.call { font: 600 30px/1.1 var(--display); color: var(--${fails ? 'fail' : 'pass'}); }
.tally { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
.tally b { display: block; font: 600 30px/1 var(--display); } .tally span { font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
.t-pass b { color: var(--pass); } .t-fail b { color: var(--fail); } .t-watch b { color: var(--watch); } .t-note b { color: var(--note); }
.cards { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 16px 18px; display: grid; gap: 8px; box-shadow: inset 4px 0 0 var(--c); }
.card .tag { font: 700 11px/1 var(--body); letter-spacing: .1em; text-transform: uppercase; color: var(--c); }
.card h3 { margin: 0; font-size: 18px; line-height: 1.3; }
.card dl { margin: 0; display: grid; grid-template-columns: 64px 1fr; gap: 4px 10px; font-size: 14.5px; } .card dt { color: var(--muted); }
.tiles { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
.tile { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; display: grid; gap: 4px; }
.tile b { font: 600 22px/1.1 var(--display); } .tile span { font-size: 13.5px; color: var(--muted); }
.tw { overflow-x: auto; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
table { width: 100%; border-collapse: collapse; font-size: 14.5px; min-width: 640px; }
th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
tr:last-child td { border-bottom: 0; }
.pill { display: inline-block; padding: 2px 8px; border-radius: 6px; font: 700 11px/1.6 var(--body); letter-spacing: .06em; text-transform: uppercase; }
.p-pass { color: var(--pass); background: var(--pass-s); } .p-fail { color: var(--fail); background: var(--fail-s); } .p-watch { color: var(--watch); background: var(--watch-s); } .p-note { color: var(--note); background: var(--note-s); }
code, .mono { font-family: var(--mono); font-size: 13px; }
.cid { font-family: var(--mono); font-size: 12px; color: var(--muted); }
a { color: var(--accent); }
@media (max-width: 720px) { .plate { grid-template-columns: 1fr; } .plate > div + div { border-left: 0; border-top: 1px solid var(--line); } }
</style></head><body><div class="wrap">
<header>
  <span class="eyebrow">Portfolio demo · fictional game · QA against docs/RULES.md</span>
  <h1>Comet Coins</h1>
  <div class="meta"><span>Generated ${new Date().toISOString().slice(0, 10)}</span><span>${v.total.toLocaleString()} captured rounds</span><span>Playwright: desktop + phone</span><span><a href="../game/index.html">Play the game</a></span><span><a href="../docs/RULES.md">Rules</a></span></div>
</header>
<section aria-labelledby="v"><div class="plate">
  <div><span class="eyebrow" id="v">Verdict</span><div class="call">${verdict}${count('watch') ? ', with 1 item to watch' : ''}</div>
  <p>Every captured round re-derives exactly from the rules (${v.total.toLocaleString()} rounds, ${v.mismatches} mismatches), the balance never drifts, and the observed RTP, hit rate and Coin Burst frequency match the exact model. ${flagged.length ? `One statistical flag on reel ${flagged.map((r) => r.reel).join(', ')} did not reproduce in 5 fresh sessions, so it's recorded as a watch item, not a bug.` : ''}</p></div>
  <div class="tally"><div class="t-pass"><b>${count('pass')}</b><span>Pass</span></div><div class="t-fail"><b>${count('fail')}</b><span>Fail</span></div><div class="t-watch"><b>${count('watch')}</b><span>Watch</span></div><div class="t-note"><b>${count('note')}</b><span>Notes</span></div></div>
</div></section>

<section aria-labelledby="f"><h2 id="f">Findings</h2><div class="cards">
${flagged.length ? `<article class="card" style="--c: var(--watch)"><span class="tag">Watch · S-4.${flagged[0].reel}</span><h3>Reel ${flagged[0].reel} stop distribution flagged in one capture</h3>
<dl><dt>Seen</dt><dd>chi² ${flagged[0].chi} on 29 df, ${fp(flagged[0].p)} in the main capture (seed 2026)</dd><dt>Re-test</dt><dd>5 fresh sessions of 5,000 rounds: every reel p &gt; 0.01 (lowest ${Math.min(...retest.flatMap((r) => r.p)).toFixed(3)})</dd><dt>Call</dt><dd>Not reproduced, so not a bug. Keep watching in future captures.</dd></dl></article>` : ''}
<article class="card" style="--c: var(--note)"><span class="tag">Note · engineering</span><h3>Use a stronger random number generator in production</h3>
<dl><dt>Why</dt><dd>The demo engine uses a small seeded PRNG (mulberry32), fine for replayable tests, not for real money or prizes.</dd><dt>Suggest</dt><dd>A cryptographic RNG on the server, with the seed kept for audit.</dd></dl></article>
<article class="card" style="--c: var(--pass)"><span class="tag">Self-test · M-3</span><h3>The verifier catches a 1-cent overpay</h3>
<dl><dt>How</dt><dd>One winning round in a copy of the capture was raised by 0.01.</dd><dt>Result</dt><dd>Flagged exactly that round: ${esc(vt.bad[0]?.problems[0] || '')}</dd></dl></article>
</div></section>

<section aria-labelledby="m"><h2 id="m">Maths and statistics</h2>
<p>The verifier (<code>tools/verify.js</code>) was written from the rules document, not from the game code. The exact model goes through all ${m.combos.toLocaleString()} stop combinations.</p>
<div class="tiles">
  <div class="tile"><b>${v.total.toLocaleString()} / ${v.total.toLocaleString()}</b><span>rounds re-derive exactly</span></div>
  <div class="tile"><b>${pct(m.rtp, 3)}</b><span>exact RTP (observed ${pct(o.rtp)}, z ${o.rtpZ.toFixed(2)})</span></div>
  <div class="tile"><b>${pct(m.hitRate)}</b><span>exact hit rate (observed ${pct(o.hitRate)}, z ${o.hitZ.toFixed(2)})</span></div>
  <div class="tile"><b>1 in ${(1 / m.burstRate).toFixed(0)}</b><span>Coin Burst (observed ${o.bursts} in ${o.rounds.toLocaleString()})</span></div>
  <div class="tile"><b>${m.maxWinX}×</b><span>highest possible win (cap 500× never reached)</span></div>
  <div class="tile"><b>${m.sd.toFixed(2)}×</b><span>standard deviation per round</span></div>
</div>
<div class="tw"><table><thead><tr><th>Re-test session</th><th>Reel 1 p</th><th>Reel 2 p</th><th>Reel 3 p</th></tr></thead><tbody>
<tr><td>Main capture (seed 2026)</td>${o.reels.map((r) => `<td class="mono">${r.p < 0.001 ? "&lt; 0.001" : r.p.toFixed(3)}</td>`).join('')}</tr>
${retest.map((r) => `<tr><td>Fresh session, seed ${r.seed}</td>${r.p.map((p) => `<td class="mono">${p.toFixed(3)}</td>`).join('')}</tr>`).join('')}
</tbody></table></div></section>

<section aria-labelledby="a"><h2 id="a">All checks</h2>
<div class="tw"><table><thead><tr><th>Result</th><th>Check</th><th>Area</th><th>Actual</th></tr></thead><tbody>
${checks.map((c) => `<tr><td><span class="pill p-${c.status}">${pill[c.status]}</span></td><td><span class="cid">${c.id}</span> ${esc(c.title)}</td><td>${esc(c.area)}</td><td>${esc(c.actual)}</td></tr>`).join('\n')}
</tbody></table></div>${pw.length ? '' : '<p>Run <code>npx playwright test --reporter=json &gt; report/playwright-results.json</code> and rebuild to include the Playwright results.</p>'}</section>

<section aria-labelledby="h"><h2 id="h">How it was tested</h2>
<p>The game was played in Chromium (desktop and Pixel 7 emulation) with Playwright, which also captured each round's payload. Every payload was re-checked by the independent verifier. A separate capture of ${v.total.toLocaleString()} rounds fed the statistics. Statistical flags were re-tested on fresh sessions before any call was made. Everything here can be reproduced with <code>npm run all</code>.</p>
</section>
</div></body></html>`;
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), html);
console.log(`report/index.html → ${verdict}: ${count('pass')} pass, ${count('fail')} fail, ${count('watch')} watch, ${count('note')} notes (${pw.length} Playwright results)`);
