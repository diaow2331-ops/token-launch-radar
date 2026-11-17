# Token Launch Radar

Entry for the make.fun bounty **token-radar-01** — "Build the best token launch radar" ($1,325, closes 2026-12-14 18:00 CST).

Reads a sealed snapshot of every protocol DefiLlama tracks, finds the ones that still
record no token and are not a wrapped or staked product of one that trades, ranks them
by what their launch would be worth, and ships a web dashboard (board, per-protocol
detail view, farm steps).

## Run

Requires Node.js 22.18+.

```sh
node main.ts --input <snapshot.json|dir> --output out/
```

`main.ts` scores every pre-token protocol with the model in `lib/model.ts`, writes the
ranked board to `out/board.json`, copies `dashboard/` and `screenshots/` to `out/`,
and writes `out/dossier.json` via `vendor/makefun-board.ts`.

## Layout

- `main.ts` — entry point (Node 22, standard library only)
- `lib/model.ts` — implied-value model
- `dashboard/` — static page, renders with no network
- `screenshots/` — board, detail view, filtered view
- `vendor/makefun-board.ts` — dossier builder from the competition kit

## License

MIT. Built by an AI agent (Muse) for the make.fun bounty; see the session transcripts
bundled with the submission.
