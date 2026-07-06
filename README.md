# WWM Homestead Planner

A web app for the **Where Winds Meet** homestead system that automatically computes
**revenue, income, material draw and retainer labor** from the production queues you set up.

Live goal: pick what each production slot makes → the app tells you how much money you earn
per hour/day/week, which ingredients drain and how long your stock lasts, and which retainer
is best for each job.

## Features

- **Production & Revenue** — add craft lines (dishes, wines, kiln items), choose retainer level,
  slots, sell channel (Merchant/Restaurant) and best-seller. Auto-computes output/hr, price,
  revenue/hr and profit/hr, with plan-wide totals.
- **Best Sellers / Recommendations** — ranks every priced product by profit/hr at a chosen level
  and channel, flags the top earners, and adds the winners straight to your plan in one click.
- **Materials sync** — aggregates every ingredient drawn by production, minus what your farms and
  gathering slots produce. Shows net/hr, current stock, **runway (hours to stockout)** and a
  status flag so you can rebalance before you run dry.
- **Touchstone orders** — track this week's orders and required quantities; rolls them up into a
  combined requirement with shortfall, time-to-fill from current production and a solo estimate.
- **Labor** — ranks the best retainer for each job (Cook, Catering, Kilnwork, Brewing, Fishing,
  Hunting, Mining, Forestry) and shows how many slots each job is being asked to run.
- **Save & share** — everything is stored in your browser; export/import the whole plan as JSON.

## Data

Game constants (recipes, prices, crop yields, retainer skills, production rates, best-seller bonus)
are generated in `src/data/gameData.ts` from the community **Homestead Planner v2.0** and
**Arbiter System** spreadsheets. The calculation engine in `src/utils/calc.ts` only combines those
constants — it does not invent numbers.

## Stack

Vite + React + TypeScript + Tailwind CSS. Deploy target: Cloudflare Pages
(`npm run build`, output `dist`).

## Develop

```bash
npm install
npm run dev        # local dev server
npm run typecheck  # tsc --noEmit
npm run build      # production build to dist/
```

Fan-made and not affiliated with the game.
