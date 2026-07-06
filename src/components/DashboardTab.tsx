import { useMemo, type ReactNode } from "react";
import type { PlanState } from "../types";
import {
  computeMaterialFlows,
  computeSummary,
  computeIndustryBreakdown,
  computeOrderRequirements,
  computeServe,
  computeSkillUsage,
  rankProductsForRoster,
  fmt,
  fmtMoney,
} from "../utils/calc";
import { Money, SectionTitle } from "./Ui";

export default function DashboardTab({
  plan,
  goto,
}: {
  plan: PlanState;
  goto: (tab: string) => void;
}) {
  const flows = useMemo(() => computeMaterialFlows(plan), [plan]);
  const summary = useMemo(() => computeSummary(plan, flows), [plan, flows]);
  const industries = useMemo(() => computeIndustryBreakdown(plan), [plan]);
  const orderReqs = useMemo(() => computeOrderRequirements(plan), [plan]);

  const serve = useMemo(() => computeServe(plan), [plan]);
  const skills = useMemo(() => computeSkillUsage(plan), [plan]);
  const stockouts = flows.filter((f) => f.status === "stockout");
  const orderShort = orderReqs.filter((r) => r.shortfall > 0);

  // what each industry *should* be making, if it isn't already the top earner
  const namesInPlan = new Set(plan.craftLines.map((l) => l.productName));
  const suggestions = useMemo(() => {
    const ranked = rankProductsForRoster(plan, false);
    const perIndustry: Record<string, (typeof ranked)[number]> = {};
    for (const r of ranked) if (!perIndustry[r.product.industry]) perIndustry[r.product.industry] = r;
    return ["Inn", "Kiln", "Brewery"]
      .map((ind) => perIndustry[ind])
      .filter((r): r is (typeof ranked)[number] => !!r && !namesInPlan.has(r.product.name));
  }, [plan.priceOverrides, plan.craftLines, plan.retainerLevels, plan.recruitedOverride]);

  return (
    <div className="space-y-6">
      <SectionTitle hint="One-glance overview of your week. Jump into any tab to edit.">
        Dashboard
      </SectionTitle>

      {/* industry breakdown */}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-line">
              <th className="th">Industry</th>
              <th className="th text-right">Slots used / cap</th>
              <th className="th text-right">Revenue/hr</th>
              <th className="th text-right">Profit/hr</th>
              <th className="th">Utilisation</th>
            </tr>
          </thead>
          <tbody>
            {industries.map((s) => {
              const pct = s.slotsCapacity > 0 ? Math.min(1, s.slotsUsed / s.slotsCapacity) : 0;
              const full = s.slotsUsed >= s.slotsCapacity && s.slotsCapacity > 0;
              return (
                <tr key={s.industry} className="border-b border-line/50 last:border-0">
                  <td className="td font-medium">{s.industry}</td>
                  <td className={`td text-right tabular-nums ${s.slotsUsed > s.slotsCapacity ? "text-red-400" : ""}`}>
                    {s.slotsUsed} / {s.slotsCapacity}
                  </td>
                  <td className="td text-right">
                    <Money n={s.revenuePerHr} className="text-gold" />
                  </td>
                  <td className="td text-right">
                    <Money n={s.profitPerHr} className="text-jade" />
                  </td>
                  <td className="td w-40">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-ink">
                      <div
                        className={`h-full ${full ? "bg-jade" : "bg-gold"}`}
                        style={{ width: `${pct * 100}%` }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-line bg-panel2/40">
              <td className="td font-semibold" colSpan={2}>
                Total per week
              </td>
              <td className="td text-right font-bold">
                <Money n={summary.revenuePerWeek} className="text-gold" />
              </td>
              <td className="td text-right font-bold">
                <Money n={summary.profitPerWeek} className="text-jade" />
              </td>
              <td className="td" />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* restaurant serving + skill slots */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold text-gray-100">Restaurant serving</h3>
            {plan.serveModelEnabled === false ? (
              <span className="chip bg-gray-500/15 text-gray-400">model off</span>
            ) : serve.serveLimited ? (
              <span className="chip bg-amber-500/15 text-amber-300">serve-limited</span>
            ) : (
              <span className="chip bg-jade/15 text-jade">keeping up</span>
            )}
          </div>
          {plan.serveModelEnabled === false ? (
            <p className="text-sm text-gray-500">
              Serve model is off — every cooked/brewed item counts as Inn income directly. Turn it on in Data.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Mini label="Cooked/hr" value={fmt(serve.sellablePerHr, 1)} />
                <Mini label="Serve cap/hr" value={fmt(serve.capacityPerHr, 1)} />
                <Mini label="Served/hr" value={fmt(serve.servedPerHr, 1)} />
              </div>
              <div className="mt-2 text-sm text-gray-300">
                Inn income: <Money n={serve.innIncomePerHr} className="text-gold" />/hr
              </div>
              {serve.serveLimited && (
                <p className="mt-1 text-xs text-amber-400">
                  Cooking outpaces your {fmt(serve.capacityPerHr, 1)}/hr catering — the surplus piles up to sell via Trade.
                </p>
              )}
            </>
          )}
        </div>

        <button className="card p-4 text-left transition-colors hover:border-gold/50" onClick={() => goto("labor")}>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold text-gray-100">Retainer skill slots</h3>
            {skills.some((s) => s.over) ? (
              <span className="chip bg-red-500/20 text-red-300">over capacity</span>
            ) : (
              <span className="chip bg-jade/15 text-jade">within limits</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            {skills.map((s) => (
              <div key={s.job} className="flex items-center justify-between">
                <span className="text-gray-400">{s.job.slice(0, 4)}</span>
                <span className={`tabular-nums ${s.over ? "text-red-400" : "text-gray-200"}`}>
                  {s.used}/{s.capacity}
                </span>
              </div>
            ))}
          </div>
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* order shortfalls */}
        <AlertCard
          title="Order shortfalls"
          count={orderShort.length}
          empty="No touchstone orders are short."
          onClick={() => goto("orders")}
        >
          {orderShort.slice(0, 6).map((r) => (
            <li key={r.item} className="flex justify-between">
              <span>{r.item}</span>
              <span className="tabular-nums text-red-400">−{fmt(r.shortfall, 0)}</span>
            </li>
          ))}
        </AlertCard>

        {/* material stockouts */}
        <AlertCard
          title="Material stockouts"
          count={stockouts.length}
          empty="No material is draining below your runway target."
          onClick={() => goto("materials")}
        >
          {stockouts.slice(0, 6).map((f) => (
            <li key={f.name} className="flex justify-between">
              <span>{f.name}</span>
              <span className="tabular-nums text-amber-400">{fmt(f.runwayH, 1)}h</span>
            </li>
          ))}
        </AlertCard>

        {/* suggestions */}
        <AlertCard
          title="Higher-profit ideas"
          count={suggestions.length}
          empty="Your industries are already running their top earners."
          onClick={() => goto("recommend")}
          accent="gold"
        >
          {suggestions.map((r) => (
            <li key={r.product.name} className="flex justify-between">
              <span>
                {r.product.name} <span className="text-gray-500">({r.product.industry})</span>
              </span>
              <span className="tabular-nums text-jade">{fmtMoney(r.profitPerHr)}/hr</span>
            </li>
          ))}
        </AlertCard>
      </div>

      <p className="text-xs text-gray-500">
        Suggestions compare each industry's current lines against its highest profit/hr product at
        level 4. Slot caps are editable in the Data tab.
      </p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg bg-ink/60 p-2">
      <div className="text-[10px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-lg font-bold tabular-nums text-gray-100">{value}</div>
    </div>
  );
}

function AlertCard({
  title,
  count,
  empty,
  children,
  onClick,
  accent = "default",
}: {
  title: string;
  count: number;
  empty: string;
  children: ReactNode;
  onClick: () => void;
  accent?: "gold" | "default";
}) {
  return (
    <button onClick={onClick} className="card p-4 text-left transition-colors hover:border-gold/50">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-semibold text-gray-100">{title}</h3>
        <span
          className={`chip ${
            count > 0
              ? accent === "gold"
                ? "bg-gold/15 text-gold"
                : "bg-red-500/20 text-red-300"
              : "bg-jade/15 text-jade"
          }`}
        >
          {count}
        </span>
      </div>
      {count === 0 ? (
        <p className="text-sm text-gray-500">{empty}</p>
      ) : (
        <ul className="space-y-1 text-sm text-gray-200">{children}</ul>
      )}
    </button>
  );
}
