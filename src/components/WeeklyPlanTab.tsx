import { useMemo, type ReactNode } from "react";
import type { PlanState } from "../types";
import { buildWeeklyPlan, fmt } from "../utils/calc";
import { Money, SectionTitle } from "./Ui";

const runway = (h: number) => (h === Infinity ? "OK" : `${fmt(h, 1)}h`);

export default function WeeklyPlanTab({ plan }: { plan: PlanState; setPlan: (updater: (p: PlanState) => PlanState) => void }) {
  const wp = useMemo(() => buildWeeklyPlan(plan), [plan]);
  const best = plan.bestSellers ?? [];

  return (
    <div className="space-y-5">
      <SectionTitle hint="Analysis of YOUR setup (Production + Catering + Materials tabs). It doesn't invent a new plan — the Optimizer tab does that.">
        Weekly plan — your week at a glance
      </SectionTitle>

      <div className="card p-3 text-sm text-gray-400">
        Best-sellers this week:{" "}
        {best.length === 0 ? (
          <span className="text-amber-400">none picked — star them on the Best Sellers tab so prices &amp; profit are right</span>
        ) : (
          <span className="text-gold">{best.join(", ")}</span>
        )}
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Projected profit / week" value={<Money n={wp.profitPerWeek} className="text-jade" />} sub={`${fmt(wp.profitPerHr * 24, 0)} / day`} />
        <Kpi label="Profit / hr" value={<Money n={wp.profitPerHr} className="text-gold" />} />
        <Kpi label="Catering income / hr" value={<Money n={wp.cateringIncomePerHr} className="text-gold" />} sub={`${fmt(wp.cateringIncomePerHr * 24, 0)} / day`} />
        <Kpi label="Trade surplus / hr" value={<Money n={wp.tradeValuePerHr} className="text-gray-100" />} sub="sell manually to the merchant" />
      </div>

      {/* 1. Make */}
      <Stage n={1} icon="🍜" title="Make — what you produce" empty={wp.production.length === 0} emptyText="No production lines yet — add them on the Production & Revenue tab.">
        <Table head={["Industry", "Product", "Retainer(s)", "Out/hr", ""]}>
          {wp.production.map((r, i) => (
            <tr key={i} className="row">
              <td className="td text-gray-400">{r.industry}</td>
              <td className="td font-medium">{r.productName}</td>
              <td className={`td ${r.retainer ? "text-gray-300" : "text-amber-400"}`}>{r.retainer || "unstaffed"}</td>
              <td className="td text-right tabular-nums">{fmt(r.outPerHr, 2)}</td>
              <td className="td">{r.isOrderFiller && <span className="chip bg-sky-500/15 text-sky-300">order</span>}</td>
            </tr>
          ))}
        </Table>
      </Stage>

      {/* 2. Cater */}
      <Stage n={2} icon="🍽️" title="Cater — your Inn income" empty={wp.catering.length === 0} emptyText="No catering lines — add them on the Production & Revenue tab.">
        <Table head={["Dish / wine", "Caterer", "Serve/hr", "Inn $", "Income/hr"]}>
          {wp.catering.map((r, i) => (
            <tr key={i} className="row">
              <td className="td font-medium">{r.productName}</td>
              <td className={`td ${r.retainer ? "text-gray-300" : "text-amber-400"}`}>{r.retainer || "unstaffed"}</td>
              <td className="td text-right tabular-nums">{fmt(r.servedPerHr, 2)}</td>
              <td className="td text-right tabular-nums">{r.innPrice || "-"}</td>
              <td className="td text-right font-semibold"><Money n={r.incomePerHr} className="text-gold" /></td>
            </tr>
          ))}
        </Table>
      </Stage>

      {/* 3. Trade surplus */}
      <Stage n={3} icon="💰" title="Trade — surplus to sell manually" empty={wp.trade.length === 0} emptyText="No surplus — everything you make is catered or used.">
        <Table head={["Item", "Surplus/hr", "Trade $", "Value/hr"]}>
          {wp.trade.map((t) => (
            <tr key={t.name} className="row">
              <td className="td font-medium">{t.name}</td>
              <td className="td text-right tabular-nums">{fmt(t.surplusPerHr, 2)}</td>
              <td className="td text-right tabular-nums">{t.tradePrice}</td>
              <td className="td text-right font-semibold"><Money n={t.tradeValuePerHr} /></td>
            </tr>
          ))}
        </Table>
      </Stage>

      {/* 4. Grow */}
      <Stage n={4} icon="🌾" title="Grow — crops running short" empty={wp.farming.length === 0} emptyText="Crops keep up with your production.">
        <Table head={["Crop", "Net/hr", "Runway", "Fields to add"]}>
          {wp.farming.map((f) => (
            <tr key={f.crop} className="row">
              <td className="td font-medium">{f.crop}</td>
              <td className="td text-right"><Money n={f.netPerHr} /></td>
              <td className="td text-right tabular-nums text-amber-400">{runway(f.runwayH)}</td>
              <td className="td text-right tabular-nums">+{f.fieldsToAdd}</td>
            </tr>
          ))}
        </Table>
      </Stage>

      {/* 5. Gather */}
      <Stage n={5} icon="🎣" title="Gather — raw materials running short" empty={wp.gathering.length === 0} emptyText="Raw materials keep up with your production.">
        <Table head={["Material", "Job", "Net/hr", "Runway", "Best gatherer"]}>
          {wp.gathering.map((g) => (
            <tr key={g.material} className="row">
              <td className="td font-medium">{g.material}</td>
              <td className="td text-gray-400">{g.job}</td>
              <td className="td text-right"><Money n={g.netPerHr} /></td>
              <td className="td text-right tabular-nums text-amber-400">{runway(g.runwayH)}</td>
              <td className={`td ${g.retainer ? "text-gray-300" : "text-amber-400"}`}>{g.retainer || "no recruited " + g.job}</td>
            </tr>
          ))}
        </Table>
      </Stage>

      {/* 6. Orders */}
      <Stage n={6} icon="📜" title="Clear touchstone orders" empty={wp.orders.length === 0} emptyText="No outstanding order shortfalls. Add this week's orders on the Orders tab.">
        <Table head={["Item", "Needed", "In stock", "Short", "Fill ETA"]}>
          {wp.orders.map((o) => (
            <tr key={o.item} className="row">
              <td className="td font-medium">{o.item}</td>
              <td className="td text-right tabular-nums">{fmt(o.needed, 0)}</td>
              <td className="td text-right tabular-nums">{fmt(o.inStock, 0)}</td>
              <td className="td text-right tabular-nums text-amber-400">{fmt(o.shortfall, 0)}</td>
              <td className="td text-right tabular-nums">{o.hoursToFill === Infinity ? "not producing" : `${fmt(o.hoursToFill, 1)}h`}</td>
            </tr>
          ))}
        </Table>
      </Stage>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="card p-3">
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

function Stage({
  n,
  icon,
  title,
  empty,
  emptyText,
  children,
}: {
  n: number;
  icon: string;
  title: string;
  empty: boolean;
  emptyText: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-200">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-panel2 text-xs text-gold">{n}</span>
        <span>{icon}</span>
        {title}
      </h3>
      {empty ? (
        <div className="card p-4 text-sm text-gray-500">{emptyText}</div>
      ) : (
        <div className="card overflow-x-auto">{children}</div>
      )}
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <table className="w-full min-w-[560px]">
      <thead>
        <tr className="border-b border-line">
          {head.map((h, i) => (
            <th key={i} className="th">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}
