import { useRef } from "react";
import type { PlanState } from "../types";
import { emptyPlan } from "../types";
import { exportPlan, importPlan } from "../utils/storage";
import { PRODUCTS, MATERIALS, RETAINERS, CROPS } from "../data/gameData";
import { NumberInput, SectionTitle } from "./Ui";

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
