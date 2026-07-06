import { useMemo, useRef, useState } from "react";
import type { PlanState, PriceOverride } from "../types";
import { emptyPlan } from "../types";
import { exportPlan, importPlan } from "../utils/storage";
import { PRODUCTS, MATERIALS, RETAINERS, CROPS } from "../data/gameData";
import { NumberInput, SectionTitle } from "./Ui";

const INDUSTRY_SLOTS: { key: string; label: string }[] = [
  { key: "Inn", label: "Kitchen (cook)" },
  { key: "Restaurant", label: "Restaurant (serve)" },
  { key: "Kiln", label: "Porcelain Kiln" },
  { key: "Brewery", label: "Aromas Brewery" },
  { key: "Local Specialties", label: "Local Specialties (gather)" },
];
const ALL_PRODUCTS = [...PRODUCTS].sort(
  (a, b) => a.industry.localeCompare(b.industry) || a.name.localeCompare(b.name)
);

export default function DataTab({
  plan,
  setPlan,
}: {
  plan: PlanState;
  setPlan: (updater: (p: PlanState) => PlanState) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [onlyMissing, setOnlyMissing] = useState(true);

  const isMissing = (p: (typeof ALL_PRODUCTS)[number]) => {
    const ov = plan.priceOverrides[p.name] ?? {};
    const missInn = p.restaurant == null && ov.inn == null;
    const missTrade = p.merchant == null && ov.trade == null;
    return missInn || missTrade;
  };
  const missCount = useMemo(() => ALL_PRODUCTS.filter(isMissing).length, [plan.priceOverrides]);
  const priceRows = useMemo(
    () => (onlyMissing ? ALL_PRODUCTS.filter(isMissing) : ALL_PRODUCTS),
    [onlyMissing, plan.priceOverrides]
  );

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
        <SectionTitle hint="Slots unlock as your homestead levels up (defaults shown for Lv 6). Kitchen/Kiln/Brewery drive the Optimizer.">
          Industry slots
        </SectionTitle>
        <div className="card flex flex-wrap items-center gap-x-5 gap-y-3 p-4">
          {INDUSTRY_SLOTS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 text-sm text-gray-300">
              {label}
              <NumberInput
                value={plan.industrySlots[key] ?? 0}
                min={0}
                max={24}
                onChange={(n) => setSlots(key, n)}
                className="w-20"
              />
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Kitchen cooks dishes → Restaurant serves them for Inn income (6 serve slots &gt; 3 cook slots, so
          cooking is the bottleneck). Local Specialties = fishing/hunting/mining/forestry gather slots.
        </p>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-gray-100">Manual prices</h2>
            <p className="text-xs text-gray-500">
              {missCount} product(s) still missing a price. Fill the in-game Inn / Trade value; blank cells
              fall back to the sheet.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-gray-400">
              <input type="checkbox" className="h-4 w-4 accent-[#d9b25b]" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
              Only items missing a price
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-400">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#5bbf9a]"
                checked={plan.manualPricesEnabled !== false}
                onChange={(e) => setPlan((p) => ({ ...p, manualPricesEnabled: e.target.checked }))}
              />
              Manual prices ON
            </label>
          </div>
        </div>
        <div className="card max-h-[32rem] overflow-auto">
          <table className="w-full min-w-[560px]">
            <thead className="sticky top-0 bg-panel">
              <tr className="border-b border-line">
                <th className="th">Product</th>
                <th className="th">Industry</th>
                <th className="th text-right w-32">Inn $ (auto)</th>
                <th className="th text-right w-32">Trade $ (manual)</th>
              </tr>
            </thead>
            <tbody>
              {priceRows.map((p) => {
                const ov = plan.priceOverrides[p.name] ?? {};
                const missInn = p.restaurant == null && ov.inn == null;
                const missTrade = p.merchant == null && ov.trade == null;
                return (
                  <tr key={p.name} className="border-b border-line/50 last:border-0">
                    <td className="td font-medium">
                      {p.name}
                      {(missInn || missTrade) && <span className="ml-2 text-xs text-amber-400">missing</span>}
                    </td>
                    <td className="td text-gray-400">{p.industry}</td>
                    <td className={`td text-right ${missInn ? "bg-amber-500/5" : ""}`}>
                      <NumberInput
                        value={ov.inn ?? p.restaurant ?? 0}
                        min={0}
                        onChange={(n) => setOverride(p.name, { inn: n || undefined })}
                        className="w-24 text-right"
                      />
                    </td>
                    <td className={`td text-right ${missTrade ? "bg-amber-500/5" : ""}`}>
                      <NumberInput
                        value={ov.trade ?? p.merchant ?? 0}
                        min={0}
                        onChange={(n) => setOverride(p.name, { trade: n || undefined })}
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
