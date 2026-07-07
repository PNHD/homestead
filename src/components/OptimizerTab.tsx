import { useMemo, useState, type ReactNode } from "react";
import type { PlanState } from "../types";
import { optimizePlan, computeSummary, computeMaterialFlows, fmt, PRODUCT_BY_NAME } from "../utils/calc";
import { NumberInput, Money, SectionTitle } from "./Ui";

function industryOf(name: string): string {
  return PRODUCT_BY_NAME[name]?.industry ?? "—";
}

const CRAFT_INDUSTRIES = ["Inn", "Kiln", "Brewery"];

export default function OptimizerTab({
  plan,
  setPlan,
}: {
  plan: PlanState;
  setPlan: (updater: (p: PlanState) => PlanState) => void;
}) {
  const [bestSeller, setBestSeller] = useState(false);
  const [ordersFirst, setOrdersFirst] = useState(true);
  const [materialSafe, setMaterialSafe] = useState(true);

  const result = useMemo(
    () => optimizePlan(plan, { bestSeller, ordersFirst, materialSafe }),
    [plan, bestSeller, ordersFirst, materialSafe]
  );

  const current = useMemo(() => {
    const flows = computeMaterialFlows(plan);
    return computeSummary(plan, flows);
  }, [plan]);

  const setSlots = (ind: string, n: number) =>
    setPlan((p) => ({ ...p, industrySlots: { ...p.industrySlots, [ind]: n } }));

  const apply = () =>
    setPlan((p) => ({
      ...p,
      craftLines: result.lines.map((l) => ({ ...l })),
      serveLines: result.serveLines.map((l) => ({ ...l })),
    }));

  const delta = result.profitPerHr - current.profitPerHr;

  return (
    <div className="space-y-5">
      <SectionTitle hint="Greedy allocation: reserve short orders, then pick the best staffed product that does not push ingredients below runway when possible.">
        Optimizer
      </SectionTitle>

      <div className="card flex flex-wrap items-end gap-4 p-4">
        {CRAFT_INDUSTRIES.map((ind) => (
          <label key={ind} className="text-xs text-gray-400">
            {ind} slots
            <NumberInput
              value={plan.industrySlots[ind] ?? 0}
              min={0}
              onChange={(n) => setSlots(ind, n)}
              className="mt-1 w-20"
            />
          </label>
        ))}
        <label className="flex items-center gap-2 pb-2 text-sm text-gray-300">
          <input type="checkbox" className="h-4 w-4 accent-[#d9b25b]" checked={bestSeller} onChange={(e) => setBestSeller(e.target.checked)} />
          Best-seller
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-gray-300">
          <input type="checkbox" className="h-4 w-4 accent-[#5bbf9a]" checked={ordersFirst} onChange={(e) => setOrdersFirst(e.target.checked)} />
          Orders first
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-gray-300">
          <input type="checkbox" className="h-4 w-4 accent-[#5bbf9a]" checked={materialSafe} onChange={(e) => setMaterialSafe(e.target.checked)} />
          Protect runway
        </label>
      </div>

      {/* projection */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Proj label="Suggested profit/hr" value={<Money n={result.profitPerHr} className="text-jade" />} />
        <Proj label="Suggested revenue/hr" value={<Money n={result.revenuePerHr} className="text-gold" />} />
        <Proj label="Current profit/hr" value={<Money n={current.profitPerHr} />} />
        <Proj
          label="Improvement /hr"
          value={
            <span className={delta >= 0 ? "text-jade" : "text-red-400"}>
              {delta >= 0 ? "+" : "−"}
              {fmt(Math.abs(delta), 0)}
            </span>
          }
        />
      </div>

      {/* suggested lines */}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead>
            <tr className="border-b border-line">
              <th className="th w-10">Slot</th>
              <th className="th">Industry</th>
              <th className="th">Product</th>
              <th className="th">Retainer</th>
            </tr>
          </thead>
          <tbody>
            {result.lines.length === 0 ? (
              <tr>
                <td className="td text-gray-500" colSpan={4}>
                  Set slot capacities above to get a suggested allocation.
                </td>
              </tr>
            ) : (
              result.lines.map((l, i) => (
                <tr key={l.id} className="border-b border-line/50 last:border-0">
                  <td className="td text-gray-500">{i + 1}</td>
                  <td className="td text-gray-400">{industryOf(l.productName)}</td>
                  <td className="td font-medium">{l.productName}</td>
                  <td className={`td ${l.retainer ? "text-gray-300" : "text-amber-400"}`}>{l.retainer || "unstaffed"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {result.notes.length > 0 && (
        <ul className="text-xs text-amber-400">
          {result.notes.map((n, i) => (
            <li key={i}>• {n}</li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <button className="btn btn-gold" onClick={apply} disabled={result.lines.length === 0}>
          Apply to plan (replaces production + catering)
        </button>
        <span className="text-xs text-gray-500">
          This overwrites your current {plan.craftLines.length} production and {(plan.serveLines ?? []).length} catering line(s).
        </span>
      </div>
    </div>
  );
}

function Proj({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="card p-3">
      <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
