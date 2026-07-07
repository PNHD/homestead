# WWM Homestead Planner

A web app for the **Where Winds Meet** homestead system that automatically computes
**revenue, income, material draw and retainer labor** from the production queues you set up.

Live goal: pick what each production slot makes → the app tells you how much money you earn
per hour/day/week, which ingredients drain and how long your stock lasts, and which retainer
is best for each job.

## Features

- **Dashboard** - one-glance weekly profit, industry slot use, Restaurant serving cap, skill-slot capacity, order shortfalls and material risks.
- **Production & Revenue** - add craft lines (dishes, wines, kiln items), assign real recruited retainers, mark best-sellers and see output/hr, Inn price, Trade price and profit.
- **Sell & Trade** - tracks finished goods accumulated since the last sold reset and estimates manual Trade-for-Profit value.
- **Best Sellers / Recommendations** - ranks priced products for your actual roster and adds a staffed line to the plan in one click.
- **Optimizer** - greedy planner that reserves short orders first, respects industry/skill slots, uses recruited retainers once each and avoids picks that push ingredients below the runway target when possible.
- **Materials sync** - aggregates ingredient draw versus farms/gathering/crafted intermediates. Shows net/hr, stock, runway and stockout risk, with bulk paste for inventory lines.
- **Touchstone orders** - track weekly orders manually or by pasting item/quantity lines; requirements roll up against stock and production.
- **Roster** - mark recruited retainers, edit skill levels, add custom retainers, and quick-recruit high-priority NPCs from the Retainer Guide.
- **Save & share** - everything is stored in your browser; export/import the whole plan as JSON.
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
