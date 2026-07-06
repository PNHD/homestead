import { useRef } from "react";
import type { PlanState, PriceOverride } from "../types";
import { emptyPlan } from "../types";
import { exportPlan, importPlan } from "../utils/storage";
import { PRODUCTS, MATERIALS, RETAINERS, CROPS } from "../data/gameData";
import { PRODUCTS_MISSING_PRICE } from "../utils/calc";
import { NumberInput, SectionTitle } from "./Ui";

const CRAFT_INDUSTRIES = ["Inn", "Kiln", "Brewery"];

export default function DataTab({
  plan,
  setPlan,
}: {
  plan: PlanState;
  setPlan: (updater: (p: PlanState) => PlanState) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const onImport = async (file?: File | null) => {
    if (!file) return;
    try {
      const next = await importPlan(file);
      setPlan(() => next);
    } catch {
      alert("Could not read that file — expected a plan JSON exported from this app.");
    }
  };

  const setSlots = (ind: string, n: number) =>
    setPlan((p) => ({ ...p, industrySlots: { ...p.industrySlots, [ind]: n } }));
  const setOverride = (name: string, patch: PriceOverride) =>
    setPlan((p) => {
      const cur = p.priceOverrides[name] ?? {};
      const merged = { ...cur, ...patch };
      const cleaned = Object.fromEntries(Object.entries(merged).filter(([, v]) => v != null && !Number.isNaN(v)));
      const next = { ...p.priceOverrides };
      if (Object.keys(cleaned).length === 0) delete next[name];
      else next[name] = cleaned;
      return { ...p, priceOverrides: next };
    });

  return (
    <div className="space-y-6">
      <div>
        <SectionTitle hint="Everything is stored in your browser (localStorage).">Save &amp; share</SectionTitle>
        <div className="card flex flex-wrap items-center gap-3 p-4">
          <button className="btn btn-gold" onClick={() => exportPlan(plan)}>
            ⬇ Export plan (JSON)
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            ⬆ Import plan
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => onImport(e.target.files?.[0])}
          />
          <button
            className="btn ml-auto text-red-300 hover:border-red-400/60"
            onClick={() => {
              if (confirm("Reset the whole plan? This clears your production lines, farms, gathering and inventory."))
                setPlan(() => emptyPlan());
            }}
          >
            Reset plan
          </button>
        </div>
      </div>

      <div>
        <SectionTitle>Homestead</SectionTitle>
        <div className="card flex flex-wrap items-center gap-4 p-4">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            Homestead level
            <NumberInput
              value={plan.homesteadLevel}
              min={1}
              max={20}
              onChange={(n) => setPlan((p) => ({ ...p, homesteadLevel: n }))}
              className="w-20"
            />
          </label>
          <span className="text-xs text-gray-500">
            Used as a reference for which recipes/crops you can access.
          </span>
        </div>
      </div>

      <div>
        <SectionTitle hint="Crafting slot capacity per industry — drives the Optimizer & Dashboard.">
          Industry slots
        </SectionTitle>
        <div className="card flex flex-wrap items-center gap-4 p-4">
          {CRAFT_INDUSTRIES.map((ind) => (
            <label key={ind} className="flex items-center gap-2 text-sm text-gray-300">
              {ind}
              <NumberInput
                value={plan.industrySlots[ind] ?? 0}
                min={0}
                max={12}
                onChange={(n) => setSlots(ind, n)}
                className="w-20"
              />
            </label>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle hint="These products have no price in any source sheet — enter the in-game value to include them everywhere.">
          Manual prices ({PRODUCTS_MISSING_PRICE.length} items missing data)
        </SectionTitle>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead>
              <tr className="border-b border-line">
                <th className="th">Product</th>
                <th className="th">Industry</th>
                <th className="th text-right w-32">Merchant $</th>
                <th className="th text-right w-32">Restaurant $</th>
              </tr>
            </thead>
            <tbody>
              {PRODUCTS_MISSING_PRICE.map((p) => {
                const ov = plan.priceOverrides[p.name] ?? {};
                return (
                  <tr key={p.name} className="border-b border-line/50 last:border-0">
                    <td className="td font-medium">{p.name}</td>
                    <td className="td text-gray-400">{p.industry}</td>
                    <td className="td text-right">
                      <NumberInput
                        value={ov.merchant ?? 0}
                        min={0}
                        onChange={(n) => setOverride(p.name, { merchant: n || undefined })}
                        className="w-24 text-right"
                      />
                    </td>
                    <td className="td text-right">
                      <NumberInput
                        value={ov.restaurant ?? 0}
                        min={0}
                        onChange={(n) => setOverride(p.name, { restaurant: n || undefined })}
                        className="w-24 text-right"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <SectionTitle hint="Read-only reference, generated from the official planner spreadsheet.">
          Game data loaded
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <RefCard n={PRODUCTS.length} label="Products (dish / wine / kiln)" />
          <RefCard n={Object.keys(MATERIALS).length} label="Materials" />
          <RefCard n={CROPS.length} label="Crops" />
          <RefCard n={RETAINERS.length} label="Retainers" />
        </div>
      </div>
    </div>
  );
}

function RefCard({ n, label }: { n: number; label: string }) {
  return (
    <div className="card p-4">
      <div className="text-2xl font-bold text-gold tabular-nums">{n}</div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  );
}
