import { useMemo, useState } from "react";
import type { PlanState } from "../types";
import { rankProductsForRoster, isWeeklyBest, fmt } from "../utils/calc";
import type { Industry } from "../data/gameData";
import { Select, Money, SectionTitle } from "./Ui";

const INDUSTRIES: (Industry | "All")[] = ["All", "Inn", "Kiln", "Brewery"];

export default function RecommendTab({
  plan,
  setPlan,
}: {
  plan: PlanState;
  setPlan: (updater: (p: PlanState) => PlanState) => void;
}) {
  const [industry, setIndustry] = useState<Industry | "All">("All");

  const ranked = useMemo(
    () => rankProductsForRoster(plan, false),
    [plan.priceOverrides, plan.manualPricesEnabled, plan.retainerLevels, plan.recruitedOverride, plan.homesteadLevel, plan.bestSellers]
  );
  const rows = useMemo(
    () => (industry === "All" ? ranked : ranked.filter((r) => r.product.industry === industry)),
    [ranked, industry]
  );

  const toggleBest = (name: string) =>
    setPlan((p) => {
      const set = new Set(p.bestSellers ?? []);
      set.has(name) ? set.delete(name) : set.add(name);
      return { ...p, bestSellers: [...set] };
    });
  const clearBest = () => setPlan((p) => ({ ...p, bestSellers: [] }));

  const selected = plan.bestSellers ?? [];

  return (
    <div className="space-y-4">
      <SectionTitle hint={`Star this week's best-sellers (+20% Inn price) — the Weekly Plan & Optimizer then prioritise them. Only recipes unlocked at Lv ${plan.homesteadLevel} shown.`}>
        Best sellers &amp; recommendations
      </SectionTitle>

      <div className="card flex flex-wrap items-center gap-3 p-4">
        <label className="text-xs text-gray-400">
          Industry
          <Select
            value={industry}
            onChange={(v) => setIndustry(v as Industry | "All")}
            options={INDUSTRIES.map((i) => ({ value: i, label: i }))}
            className="mt-1 w-36"
          />
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
          <span className="text-gray-400">This week's best-sellers:</span>
          {selected.length === 0 ? (
            <span className="text-gray-600">none picked — star the ⭐ items the game marks this week</span>
          ) : (
            <>
              {selected.map((n) => (
                <span key={n} className="chip bg-gold/15 text-gold">
                  {n}
                </span>
              ))}
              <button className="btn px-2 py-1 text-xs" onClick={clearBest}>
                Clear
              </button>
            </>
          )}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[920px]">
          <thead className="sticky top-0 z-10 bg-panel">
            <tr className="border-b border-line">
              <th className="th w-12 text-center">Best?</th>
              <th className="th">Product</th>
              <th className="th">Industry</th>
              <th className="th text-right">Inn $</th>
              <th className="th text-right">Profit/unit</th>
              <th className="th text-right">Your retainer</th>
              <th className="th text-right">Profit/hr</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isBest = isWeeklyBest(r.product.name, plan);
              return (
                <tr key={r.product.name} className={`border-b border-line/50 last:border-0 ${isBest ? "bg-gold/5" : ""}`}>
                  <td className="td text-center">
                    <button
                      onClick={() => toggleBest(r.product.name)}
                      title={isBest ? "Unmark best-seller" : "Mark as this week's best-seller (+20%)"}
                      className={`text-lg leading-none ${isBest ? "text-gold" : "text-gray-600 hover:text-gray-300"}`}
                    >
                      {isBest ? "★" : "☆"}
                    </button>
                  </td>
                  <td className="td font-medium">{r.product.name}</td>
                  <td className="td text-gray-400">{r.product.industry}</td>
                  <td className={`td text-right tabular-nums ${isBest ? "text-gold" : ""}`}>{r.price}</td>
                  <td className="td text-right font-semibold tabular-nums">{fmt(r.profitPerUnit, 1)}</td>
                  <td className="td text-right tabular-nums">
                    {r.hasRetainer ? (
                      <span className="text-gray-300">
                        L{r.level}
                        {r.estimated && <span className="ml-1 text-[10px] text-amber-400">est</span>}
                      </span>
                    ) : (
                      <span className="text-amber-400">none · @L4</span>
                    )}
                  </td>
                  <td className="td text-right font-semibold">
                    <Money n={r.profitPerHr} className="text-jade" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500">
        Star the items the game flags as this week's best-sellers — they get +20% Inn price, so the ranking,
        the <span className="text-gray-300">Weekly Plan</span> and the <span className="text-gray-300">Optimizer</span>{" "}
        automatically prefer producing and catering them. <span className="text-gray-300">Profit/unit</span> = Inn
        price − input cost.
      </p>
    </div>
  );
}
