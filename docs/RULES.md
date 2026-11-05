# Comet Coins: game rules (spec document)

> A **fictional** instant-win game made for this portfolio. This document plays the role of the "source of truth" a game team hands to QA. Every claim below is turned into a check, either in `tools/verify.js` (the maths) or in `tests/` (the behaviour).

## 1. Overview
- Instant round: the server (here `game/engine.js`) resolves the whole round at once, and the client replays it.
- Currency: **credits**, shown with 2 decimals.
- Play amounts: **0.10, 0.20, 0.50, 1, 2, 5, 10** credits.

## 2. Grid and reels
- **3 reels × 3 rows.**
- Each reel has a fixed strip of 30 symbols (§6). A round picks one stop per reel uniformly at random. The window shows that stop and the next two symbols, wrapping around the strip.

## 3. Lines
- **5 fixed lines**: top row, middle row, bottom row, the ↘ diagonal (top-left to bottom-right) and the ↗ diagonal (bottom-left to top-right).
- **Line bet = play amount ÷ 5.**
- A line pays when all 3 positions show the same symbol. **STAR is wild** and substitutes for every symbol except COIN. Three STARs pay as STAR.
- Each line pays only its highest combination.

## 4. Pay table (× line bet)

| Symbol | 3 on a line |
|---|---|
| STAR (wild) | 80 |
| COMET | 40 |
| PLANET | 24 |
| MOON | 16 |
| ROCK | 8 |
| DUST | 5 |

COIN never pays on a line.

## 5. Coin Burst (scatter)
- **3 COINs anywhere** on the grid pay **10 × play amount**, on top of any line wins.
- Only one COIN can land per reel (strips never hold two COINs within 3 stops of each other).

## 6. Reel strips (30 stops each, read top to bottom)
Letters: S = STAR, C = COMET, P = PLANET, M = MOON, R = ROCK, D = DUST, O = COIN.

```
Reel 1: DMDPDRMPDDOMRSPRRCRDMDRCODDSMR
Reel 2: RPSDMRDDDDRDMRDOMCDCSRRMDMPOPR
Reel 3: RDRORDMPCMCDSMMODPRDDDRPDMSRDR
```

Symbol counts per reel:

| Symbol | Reel 1 | Reel 2 | Reel 3 |
|---|---|---|---|
| STAR | 2 | 2 | 2 |
| COMET | 2 | 2 | 2 |
| PLANET | 3 | 3 | 3 |
| MOON | 5 | 5 | 5 |
| ROCK | 7 | 7 | 7 |
| DUST | 9 | 9 | 9 |
| COIN | 2 | 2 | 2 |

## 7. Settlement
- **Total win = line wins + Coin Burst**, capped at **500 × play amount**, then **rounded down to the cent**.
- **Balance after = balance before − play amount + total win.**
- A play is refused, with no round and no debit, if the play amount is more than the balance. The client shows "Not enough credits".

## 8. Controls
- **−** and **+** step through the play amounts and are disabled at the ends of the list.
- While a round plays, PLAY, − and + are disabled.
- The last 10 rounds are listed under the game (newest first).

## 9. Unspecified (questions for the game team)
- Is the cap applied before or after rounding? *(The engine caps first, then rounds down. QA reports that as the observed behaviour.)*
- What should the RTP be? *(Not stated. QA computes it exactly by enumeration and reports it.)*
