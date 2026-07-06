import { useState } from "react";
import { MATERIALS, CROPS, type Job } from "../data/gameData";
import type { PlanState, GatherLine, FarmLine } from "../types";
import { uid } from "../utils/storage";
import {
  computeMaterialFlows,
  GATHERABLE_MATERIALS,
  recruitedRetainersFor,
  orderableItems,
  fmt,
} from "../utils/calc";
import { NumberInput, Combobox, StatusChip, SectionTitle } from "./Ui";

const GATHER_OPTIONS = GATHERABLE_MATERIALS.map((m) => ({
  value: m.name,
  label: `${m.name} (${m.job})`,
})).sort((a, b) => a.label.localeCompare(b.label));

const CROP_OPTIONS = [...CROPS]
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

  // gather line helpers
  const addGather = () =>
    setPlan((p) => ({
      ...p,
      gatherLines: [
        ...p.gatherLines,
        { id: uid(), materialName: GATHERABLE_MATERIALS[0]?.name ?? "", retainer: "" },
      ],
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
    setPlan((p) => ({ ...p, inventory: { ...p.inventory, [name]: v } }));
  const setRunway = (v: number) => setPlan((p) => ({ ...p, runwayTargetH: v }));

  return (
    <div className="space-y-6">
      {/* --- supply editors --- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-gray-100">Gathering (Local Specialties)</h3>
            <button className="btn" onClick={addGather}>
              + Gather slot
            </button>
          </div>
          {plan.gatherLines.length === 0 ? (
            <p className="text-sm text-gray-500">
              Add fishing / hunting / mining / forestry slots to supply raw ingredients.
            </p>
          ) : (
            <div className="space-y-2">
              {plan.gatherLines.map((g) => {
                const job = MATERIALS[g.materialName]?.job as Job | undefined;
                const retOpts = [
                  { value: "", label: "— assign retainer —" },
                  ...(job ? recruitedRetainersFor(job, plan) : []).map((r) => ({
                    value: r.name,
                    label: `${r.name} · L${r.level}`,
                  })),
                ];
                return (
                  <div key={g.id} className="flex items-center gap-2">
                    <Combobox
                      value={g.materialName}
                      onChange={(v) => updGather(g.id, { materialName: v })}
                      options={GATHER_OPTIONS}
                      placeholder="Search material…"
                      className="flex-1"
                    />
                    <Combobox
                      value={g.retainer}
                      onChange={(v) => updGather(g.id, { retainer: v })}
                      options={retOpts}
                      placeholder="Search retainer…"
                      className="flex-1"
                    />
                    <button className="btn px-2 py-1" onClick={() => rmGather(g.id)}>
                      ✕
                    </button>
                  </div>
                );
              })}
              <div className="text-xs text-gray-500">material · retainer (rate from their skill level)</div>
            </div>
          )}
        </div>

        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-gray-100">Farms</h3>
            <button className="btn" onClick={addFarm}>
              + Farm field
            </button>
          </div>
          {plan.farmLines.length === 0 ? (
            <p className="text-sm text-gray-500">Add farm fields to grow crops (watered + fertilized yield).</p>
          ) : (
            <div className="space-y-2">
              {plan.farmLines.map((f) => (
                <div key={f.id} className="flex items-center gap-2">
                  <Combobox
                    value={f.cropName}
                    onChange={(v) => updFarm(f.id, { cropName: v })}
                    options={CROP_OPTIONS}
                    placeholder="Search crop…"
                    className="flex-1"
                  />
                  <NumberInput value={f.farms} min={0} onChange={(n) => updFarm(f.id, { farms: n })} className="w-20" />
                  <button className="btn px-2 py-1" onClick={() => rmFarm(f.id)}>
                    ✕
                  </button>
                </div>
              ))}
              <div className="text-xs text-gray-500">columns: crop · number of full farms</div>
            </div>
          )}
        </div>
      </div>

      {/* --- flow table --- */}
      <div>
        <div className="flex items-end justify-between">
          <SectionTitle hint="Needed = drawn by production. Produced = farmed + gathered + crafted.">
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
              if (v) setPlan((p) => ({ ...p, inventory: { ...p.inventory, [v]: p.inventory[v] ?? 0 } }));
              setAddItem("");
            }}
            options={ITEM_OPTIONS}
            placeholder="Search any material or dish…"
            className="w-72"
          />
          <span className="text-xs text-gray-500">then set its quantity in the table below.</span>
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
                        value={f.inStock}
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
