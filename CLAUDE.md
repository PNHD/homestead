# WWM Homestead Planner — project guide for AI agents

**This repo is ONLY the "Where Winds Meet" homestead revenue/income/labor planner.**
It is a SEPARATE project from `wwm-calc` (the gear graduation calculator) — do not mix code
between them.

- Stack: Vite + React + TS + Tailwind. Deploy: Cloudflare Pages (`npm run build`, output `dist`).

## What it does
Given the production queues the user sets up, it auto-computes:
- **Revenue / income** per hour / day / week (Dashboard, Production, Sell tabs)
- **Material sync** - needed vs produced per hour, stock runway, shortages (Materials tab)
- **Orders + Optimizer** - short orders, slot caps, material-aware greedy suggestions
- **Roster** - recruited retainers, skill overrides, custom retainers and skill-slot demand

## Data provenance — do NOT invent numbers
`src/data/gameData.ts` is generated from the community **Homestead Planner v2.0** and
**Arbiter System** spreadsheets. The engine in `src/utils/calc.ts` only combines those constants:
- `output/hr = BASE_RATES[job] * efficiency(level)`
- `draw/hr   = output/hr * recipe_amount`
- `revenue/hr = served/hr * Inn price` when Restaurant serving model is on
- `profit/hr = revenue/hr - inputCost * output/hr`

Efficiency levels 1–4 are verified (1.02/1.05/1.07/1.10); 5–10 are estimated and flagged `est.`
in the UI. If game data changes, regenerate `gameData.ts` from the spreadsheets rather than
hand-editing values.

## Verify
- `npm run typecheck` must stay clean.
- `npm run build` must succeed.
