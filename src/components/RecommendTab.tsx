import { useMemo, useState } from "react";
import type { PlanState } from "../types";
import { uid } from "../utils/storage";
import { rankProductsForRoster, recruitedRetainersFor, fmt } from "../utils/calc";
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
  const [bestSeller, setBestSeller] = useState(false);
  const [industry, setIndustry] = useState<Industry | "All">("All");

  const ranked = useMemo(
    () => rankProductsForRoster(plan, bestSeller),
    [plan.priceOverrides, plan.manualPricesEnabled, plan.retainerLevels, plan.recruitedOverride, plan.homesteadLevel, bestSeller]
  );
  const rows = useMemo(
    () => (industry === "All" ? ranked : ranked.filter((r) => r.product.industry === industry)),
    [ranked, industry]
  );

  const addToPlan = (productName: string) => {
    const p = ranked.find((r) => r.product.name === productName)?.product;
    const best = p ? recruitedRetainersFor(p.job, plan)[0]?.name ?? "" : "";
    setPlan((prev) => ({
      ...prev,
      craftLines: [...prev.craftLines, { id: uid(), productName, retainer: best, bestSeller }],
    }));
  };

  return (
    <div className="space-y-4">
      <SectionTitle hint={`Ranked by profit per item. Only recipes unlocked at Homestead Lv ${plan.homesteadLevel} are shown.`}>
        Best sellers &amp; recommendations
      </SectionTitle>

      <div className="card flex flex-wrap items-end gap-4 p-4">
        <label className="text-xs text-gray-400">
          Industry
          <Select
            value={industry}
            onChange={(v) => setIndustry(v as Industry | "All")}
            options={INDUSTRIES.map((i) => ({ value: i, label: i }))}
            className="mt-1 w-36"
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-gray-300">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[#d9b25b]"
            checked={bestSeller}
            onChange={(e) => setBestSeller(e.target.checked)}
          />
          Best-seller (+20%)
        </label>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b border-line">
              <th className="th w-10">#</th>
              <th className="th">Product</th>
              <th className="th">Industry</th>
              <th className="th text-right">Inn $</th>
              <th className="th text-right">Profit/unit</th>
              <th className="th text-right">Your retainer</th>
              <th className="th text-right">Profit/hr</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.product.name} className="border-b border-line/50 last:border-0">
                <td className="td text-gray-500">{i + 1}</td>
                <td className="td font-medium">
                  {r.product.name}
                  {i < 3 && industry === "All" && <span className="ml-2 text-gold">★</span>}
                </td>
                <td className="td text-gray-400">{r.product.industry}</td>
                <td className="td text-right tabular-nums">{r.price}</td>
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
                <td className="td text-right">
                  <button className="btn px-2 py-1 text-xs" onClick={() => addToPlan(r.product.name)}>
                    + Plan
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500">
        <span className="text-gray-300">Profit/unit</span> = Inn price − input cost (fixed per item —
        this is what makes a "best seller"). <span className="text-gray-300">Profit/hr</span> also depends on how
        fast your assigned retainer works, so it uses your best recruited retainer's level for that job (or a
        level-4 reference if you have none yet). Edit retainer levels on the Roster tab.
      </p>
    </div>
  );
}
