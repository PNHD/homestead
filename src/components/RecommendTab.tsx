import { useMemo, useState } from "react";
import type { PlanState, SellChannel } from "../types";
import { uid } from "../utils/storage";
import { rankProducts, bestRetainersFor, fmt } from "../utils/calc";
import type { Industry } from "../data/gameData";
import { NumberInput, Select, Money, SectionTitle } from "./Ui";

const INDUSTRIES: (Industry | "All")[] = ["All", "Inn", "Kiln", "Brewery"];

export default function RecommendTab({
  plan,
  setPlan,
}: {
  plan: PlanState;
  setPlan: (updater: (p: PlanState) => PlanState) => void;
}) {
  const [level, setLevel] = useState(4);
  const [channel, setChannel] = useState<SellChannel>("restaurant");
  const [bestSeller, setBestSeller] = useState(false);
  const [industry, setIndustry] = useState<Industry | "All">("All");

  const ranked = useMemo(() => rankProducts(level, channel, bestSeller), [level, channel, bestSeller]);
  const rows = useMemo(
    () => (industry === "All" ? ranked : ranked.filter((r) => r.product.industry === industry)),
    [ranked, industry]
  );

  const addToPlan = (productName: string) => {
    const p = ranked.find((r) => r.product.name === productName)?.product;
    const best = p ? bestRetainersFor(p.job)[0]?.name ?? "" : "";
    setPlan((prev) => ({
      ...prev,
      craftLines: [
        ...prev.craftLines,
        { id: uid(), productName, retainer: best, level, slots: 1, channel, bestSeller },
      ],
    }));
  };

  return (
    <div className="space-y-4">
      <SectionTitle hint="Products ranked by profit/hr at the settings below. Add the winners straight to your plan.">
        Best sellers &amp; recommendations
      </SectionTitle>

      <div className="card flex flex-wrap items-end gap-4 p-4">
        <label className="text-xs text-gray-400">
          Skill level
          <NumberInput value={level} min={1} max={10} onChange={(n) => setLevel(Math.min(10, Math.max(1, n)))} className="mt-1 w-20" />
        </label>
        <label className="text-xs text-gray-400">
          Sell at
          <Select<SellChannel>
            value={channel}
            onChange={setChannel}
            options={[
              { value: "restaurant", label: "Restaurant" },
              { value: "merchant", label: "Merchant" },
            ]}
            className="mt-1 w-36"
          />
        </label>
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
              <th className="th text-right">Price</th>
              <th className="th text-right">Out/hr</th>
              <th className="th text-right">Revenue/hr</th>
              <th className="th text-right">Profit/unit</th>
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
                <td className="td text-right tabular-nums">
                  {fmt(r.outPerHr, 2)}
                  {r.estimated && <span className="ml-1 text-[10px] text-amber-400">est</span>}
                </td>
                <td className="td text-right font-semibold">
                  <Money n={r.revenuePerHr} className="text-gold" />
                </td>
                <td className="td text-right tabular-nums">{fmt(r.profitPerUnit, 1)}</td>
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
        Ranking assumes every slot runs at level {level}. Input cost from recipes; 8 products without a
        recorded price in any source sheet are omitted. Currently {plan.craftLines.length} line(s) in your plan.
      </p>
    </div>
  );
}
