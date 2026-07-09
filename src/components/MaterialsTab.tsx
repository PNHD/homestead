import { useState } from "react";
import { MATERIALS, CROPS, type Job } from "../data/gameData";
import type { PlanState, GatherLine, FarmLine } from "../types";
import { uid } from "../utils/storage";
import {
  computeMaterialFlows,
  reSync,
  GATHERABLE_MATERIALS,
  recruitedRetainersFor,
  busyRetainers,
  orderableItems,
  parseItemQtyLines,
  fmt,
} from "../utils/calc";
import { NumberInput, Combobox, StatusChip, SectionTitle } from "./Ui";

const GATHER_JOBS: { job: Job; label: string }[] = [
  { job: "Fishing", label: "Fishing" },
  { job: "Hunting", label: "Hunting" },
  { job: "Mining", label: "Mining" },
  { job: "Forestry", label: "Forestry (wood)" },
];
const materialOptionsFor = (job: Job) =>
  GATHERABLE_MATERIALS.filter((m) => m.job === job)
    .map((m) => ({ value: m.name, label: m.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
const firstMaterialFor = (job: Job) => GATHERABLE_MATERIALS.find((m) => m.job === job)?.name ?? "";

const cropOptionsForLevel = (level: number) =>
  [...CROPS]
    .filter((c) => (c.reqLvl ?? 1) <= level)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ value: c.name, label: `${c.name} (${fmt(c.yieldPerHrFarm ?? 0, 0)}/hr/farm)` }));

const ITEM_OPTIONS = orderableItems().map((n) => ({ value: n, label: n }));

export default function MaterialsTab({
  plan,
  setPlan,
}: {
  plan: PlanState;
  setPlan: (updater: (p: PlanState) => PlanState) => void;
}) {
  const flows = computeMaterialFlows(plan);
  const [addItem, setAddItem] = useState("");
  const [bulkStock, setBulkStock] = useState("");

  // gather line helpers
  const addGatherTo = (job: Job) =>
    setPlan((p) => ({
      ...p,
      gatherLines: [...p.gatherLines, { id: uid(), materialName: firstMaterialFor(job), retainer: "" }],
    }));
  const updGather = (id: string, patch: Partial<GatherLine>) =>
    setPlan((p) => ({ ...p, gatherLines: p.gatherLines.map((g) => (g.id === id ? { ...g, ...patch } : g)) }));
  const rmGather = (id: string) =>
    setPlan((p) => ({ ...p, gatherLines: p.gatherLines.filter((g) => g.id !== id) }));

  // farm helpers
  const addFarm = () =>
    setPlan((p) => ({ ...p, farmLines: [...p.farmLines, { id: uid(), cropName: CROPS[0].name, farms: 1 }] }));
  const updFarm = (id: string, patch: Partial<FarmLine>) =>
    setPlan((p) => ({ ...p, farmLines: p.farmLines.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));
  const rmFarm = (id: string) =>
    setPlan((p) => ({ ...p, farmLines: p.farmLines.filter((f) => f.id !== id) }));

  const setStock = (name: string, v: number) =>
    setPlan((p) => reSync(p, Date.now(), { [name]: v }));
  const setRunway = (v: number) => setPlan((p) => ({ ...p, runwayTargetH: v }));
  const importStock = () => {
    const rows = parseItemQtyLines(bulkStock, ITEM_OPTIONS.map((o) => o.value));
    if (rows.length === 0) return;
    setPlan((p) => reSync(p, Date.now(), rows.reduce((e, r) => ({ ...e, [r.item]: r.qty }), {} as Record<string, number>)));
    setBulkStock("");
  };

  return (
    <div className="space-y-6">
      {/* --- supply editors --- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-3 font-semibold text-gray-100">Gathering (Local Specialties)</h3>
          <div className="space-y-3">
            {GATHER_JOBS.map(({ job, label }) => {
              const lines = plan.gatherLines.filter((g) => MATERIALS[g.materialName]?.job === job);
              const matOpts = materialOptionsFor(job);
              const mats = new Set(lines.map((g) => g.materialName));
              const totalOut = [...mats].reduce((s, m) => s + (flows.find((f) => f.name === m)?.producedPerHr ?? 0), 0);
              return (
                <div key={job}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-200">
                      {label}
                      {totalOut > 0 && <span className="ml-2 text-xs font-normal text-jade tabular-nums">{fmt(totalOut, 1)}/hr</span>}
                    </span>
                    <button className="btn px-2 py-0.5 text-xs" onClick={() => addGatherTo(job)}>
                      + slot
                    </button>
                  </div>
                  {lines.length === 0 ? (
                    <p className="text-xs text-gray-600">No {label.toLowerCase()} slots.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {lines.map((g) => {
                        const busy = busyRetainers(plan, g.id);
                        const retOpts = [
                          { value: "", label: "— assign retainer —" },
                          ...recruitedRetainersFor(job, plan)
                            .filter((r) => !busy.has(r.name))
                            .map((r) => ({ value: r.name, label: `${r.name} · L${r.level}` })),
                        ];
                        return (
                          <div key={g.id} className="flex items-center gap-2">
                            <Combobox value={g.materialName} onChange={(v) => updGather(g.id, { materialName: v })} options={matOpts} placeholder={`${label} material…`} className="flex-1" />
                            <Combobox value={g.retainer} onChange={(v) => updGather(g.id, { retainer: v })} options={retOpts} placeholder="Retainer…" className="flex-1" />
                            <button className="btn px-2 py-1" onClick={() => rmGather(g.id)}>✕</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-gray-100">Farms</h3>
            <button className="btn" onClick={addFarm}>
              + Farm field
            </button>
          </div>
          {plan.farmLines.length === 0 ? (
            <p className="text-sm text-gray-500">Add farm fields to grow crops (16 plots = 1 field).</p>
          ) : (
            <div className="space-y-2">
              {plan.farmLines.map((f) => (
                <div key={f.id} className="flex items-center gap-2">
                  <Combobox
                    value={f.cropName}
                    onChange={(v) => updFarm(f.id, { cropName: v })}
                    options={cropOptionsForLevel(plan.homesteadLevel)}
                    placeholder="Search crop…"
                    className="flex-1"
                  />
                  <NumberInput value={f.farms} min={0} onChange={(n) => updFarm(f.id, { farms: n })} className="w-20" />
                  <button className="btn px-2 py-1" onClick={() => rmFarm(f.id)}>
                    ✕
                  </button>
                </div>
              ))}
              <div className="text-xs text-gray-500">columns: crop · fields or plots (16 plots = 1 field)</div>
            </div>
          )}
        </div>
      </div>

      {/* --- flow table --- */}
      <div>
        <div className="flex items-end justify-between">
          <SectionTitle hint="Needed = drawn by production. Produced = farmed + gathered + crafted. In stock auto-updates from net flow while the app is open — edit any count to correct it and re-anchor.">
            Material flow &amp; sync
          </SectionTitle>
          <label className="mb-3 flex items-center gap-2 text-xs text-gray-400">
            Runway target (h)
            <NumberInput value={plan.runwayTargetH} min={1} onChange={setRunway} className="w-20" />
          </label>
        </div>

        <div className="card mb-3 flex flex-wrap items-center gap-2 p-3">
          <span className="text-xs text-gray-400">Add an item you have in stock:</span>
          <Combobox
            value={addItem}
            onChange={(v) => {
              if (v) setPlan((p) => reSync(p, Date.now(), p.inventory[v] == null ? { [v]: 0 } : {}));
              setAddItem("");
            }}
            options={ITEM_OPTIONS}
            placeholder="Search any material or dish…"
            className="w-72"
          />
          <span className="text-xs text-gray-500">then set its quantity in the table below.</span>
          <textarea
            className="input min-h-20 w-full"
            value={bulkStock}
            onChange={(e) => setBulkStock(e.target.value)}
            placeholder={"Paste stock, one per line: Tomato 120"}
          />
          <button className="btn btn-gold" onClick={importStock} disabled={!bulkStock.trim()}>
            Import stock lines
          </button>
        </div>

        {flows.length === 0 ? (
          <div className="card p-8 text-center text-gray-500">
            Nothing flowing yet. Add production lines to see which ingredients drain and how long stock lasts.
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr className="border-b border-line">
                  <th className="th">Material</th>
                  <th className="th">Category</th>
                  <th className="th">Source</th>
                  <th className="th text-right">Needed/hr</th>
                  <th className="th text-right">Produced/hr</th>
                  <th className="th text-right">Net/hr</th>
                  <th className="th text-right w-28">In stock</th>
                  <th className="th text-right">Runway</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {flows.map((f) => (
                  <tr key={f.name} className="border-b border-line/50 last:border-0">
                    <td className="td font-medium">{f.name}</td>
                    <td className="td text-gray-400">{f.category}</td>
                    <td className="td text-gray-400">{MATERIALS[f.name]?.source ?? f.source}</td>
                    <td className="td text-right tabular-nums">{fmt(f.neededPerHr, 2)}</td>
                    <td className="td text-right tabular-nums">{fmt(f.producedPerHr, 2)}</td>
                    <td className={`td text-right tabular-nums ${f.netPerHr < 0 ? "text-red-400" : "text-jade"}`}>
                      {f.netPerHr >= 0 ? "+" : "−"}
                      {fmt(Math.abs(f.netPerHr), 2)}
                    </td>
                    <td className="td text-right">
                      <NumberInput
                        value={Math.round(f.inStock)}
                        min={0}
                        onChange={(n) => setStock(f.name, n)}
                        className="w-24 text-right"
                      />
                    </td>
                    <td className="td text-right tabular-nums">{f.runwayH === Infinity ? "∞" : `${fmt(f.runwayH, 1)}h`}</td>
                    <td className="td">
                      <StatusChip status={f.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
