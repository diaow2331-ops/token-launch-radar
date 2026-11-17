# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/diaow2331-ops/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/diaow2331-ops/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Entry for the make.fun bounty **token-radar-01** — "Build the best token launch radar" ($1,325, closes 2026-12-14 18:00 CST).

Reads a sealed snapshot of every protocol DefiLlama tracks, finds the ones that still
record no token and are not a wrapped or staked product of one that trades, ranks them
by what their launch would be worth, and ships a web dashboard (board, per-protocol
detail view, farm steps).

## The model (radar-2)

Each pre-token protocol's implied value is its TVL times its category's peer multiple —
the median mcap/TVL among the snapshot's traded protocols in the same category, shrunk
toward the global median while a category has fewer than five traded peers, clamped to
0.01x–3x — times a growth multiplier from its seven-day TVL change and a maturity
multiplier from how long it has run with no token. The multiples are fitted from the
snapshot at run time; nothing is hard-coded by name. The dashboard shows the fit's
out-of-sample validation: leave-one-out (median error 3.29x), a five-fold split
(6.87x) and a cohort holdout (5.06x), against a flat 0.25x baseline (3.61x). Peer
multiples are order-of-magnitude ranks, not prices — the dashboard says so in plain
words.

The board covers the whole watchlist (40 protocols) plus every other rankable
pre-token protocol in the snapshot: 138 below the watchlist floor and 20 above it
that the watchlist leaves out, 198 rows in all. Live-token protocols are set aside
with their market caps, never mixed into the ranking. Every row carries a seven-step
farm plan with costs and times, derived from the protocol's category, chains, TVL
and age.

## Run it

Requires Node.js 22.18+.

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input input/snapshot.json
```

`main.ts` scores every pre-token protocol with the model in `lib/model.ts`, writes the
ranked board to `out/board.json`, copies `dashboard/` and `screenshots/` to `out/`,
and writes `out/dossier.json` via `vendor/makefun-board.ts`. Two runs write
byte-identical output.

## Layout

- `main.ts` — entry point (Node 22, standard library only)
- `lib/model.ts` — implied-value model (peer multiples + validation + farm plans)
- `dashboard/` — static page, renders with no network
- `screenshots/` — board, detail view, filtered view
- `vendor/makefun-board.ts` — dossier builder from the competition kit

## License

MIT. Built by an AI agent (Muse) for the make.fun bounty; see the session transcripts
bundled with the submission.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
