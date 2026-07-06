import { PRODUCTS } from "../data/gameData";
import type { PlanState, CraftLine } from "../types";
import { uid } from "../utils/storage";
import { calcCraftLine, recruitedRetainersFor, fmt, PRODUCT_BY_NAME } from "../utils/calc";
import { Combobox, Select, Money, SectionTitle } from "./Ui";

const PRODUCT_OPTIONS = [...PRODUCTS]
  .sort((a, b) => a.industry.localeCompare(b.industry) || a.name.localeCompare(b.name))
  .map((p) => ({ value: p.name, label: `${p.name} · ${p.industry}` }));

export default function ProductionTab({
  plan,
  setPlan,
}: {
  plan: PlanState;
  setPlan: (updater: (p: PlanState) => PlanState) => void;
}) {
  const update = (id: string, patch: Partial<CraftLine>) =>
    setPlan((p) => ({ ...p, craftLines: p.craftLines.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  const remove = (id: string) =>
    setPlan((p) => ({ ...p, craftLines: p.craftLines.filter((l) => l.id !== id) }));
  const duplicate = (id: string) =>
    setPlan((p) => {
      const src = p.craftLines.find((l) => l.id === id);
      if (!src) return p;
      const i = p.craftLines.findIndex((l) => l.id === id);
      const copy = { ...src, id: uid() };
      const next = [...p.craftLines];
      next.splice(i + 1, 0, copy);
      return { ...p, craftLines: next };
    });
  const add = () =>
    setPlan((p) => ({
      ...p,
      craftLines: [...p.craftLines, { id: uid(), productName: PRODUCTS[0].name, retainer: "", bestSeller: false }],
    }));

  const calcs = plan.craftLines.map((l) => calcCraftLine(l, plan));
  const totRev = calcs.reduce((s, c) => s + c.revenuePerHr, 0);
  const totProfit = calcs.reduce((s, c) => s + c.profitPerHr, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle hint="1 row = 1 queue slot worked by 1 retainer. Output rate follows that retainer's level.">
          Production &amp; Revenue
        </SectionTitle>
        <button className="btn btn-gold" onClick={add}>
          + Add production line
        </button>
      </div>

      {plan.craftLines.length === 0 ? (
        <div className="card p-8 text-center text-gray-500">
          No production lines yet. Click <span className="text-gold">Add production line</span>, pick a
          product and assign a retainer — output/hr comes from that retainer's skill level.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[1040px]">
            <thead>
              <tr className="border-b border-line">
                <th className="th">Product</th>
                <th className="th">Retainer (sets level)</th>
                <th className="th">Best-seller</th>
                <th className="th text-right">Out/hr</th>
                <th className="th text-right">Inn $</th>
                <th className="th text-right">Trade $</th>
                <th className="th text-right">Inn income/hr</th>
                <th className="th text-right">Profit/hr</th>
                <th className="th"></th>
              </tr>
            </thead>
            <tbody>
              {plan.craftLines.map((line) => {
                const c = calcCraftLine(line, plan);
                const p = PRODUCT_BY_NAME[line.productName];
                const retOptions = p
                  ? [
                      { value: "", label: "— assign retainer —" },
                      ...recruitedRetainersFor(p.job, plan).map((r) => ({
                        value: r.name,
                        label: `${r.name} · ${p.job} L${r.level}${r.confidant ? " ★" : ""}`,
                      })),
                    ]
                  : [{ value: "", label: "—" }];
                return (
                  <tr key={line.id} className="border-b border-line/50 last:border-0">
                    <td className="td min-w-[240px]">
                      <Combobox
                        value={line.productName}
                        onChange={(v) => update(line.id, { productName: v })}
                        options={PRODUCT_OPTIONS}
                        placeholder="Search product…"
                      />
                      {p && (
                        <div className="mt-1 text-xs text-gray-500">
                          Req Lv {p.lvl ?? "?"} · {p.ingredients.map((i) => `${i.amt}× ${i.name}`).join(", ")}
                        </div>
                      )}
                    </td>
                    <td className="td min-w-[210px]">
                      <Select
                        value={line.retainer}
                        onChange={(v) => update(line.id, { retainer: v })}
                        options={retOptions}
                      />
                      {!c.active && (
                        <div className="mt-1 text-xs text-amber-400">
                          {retOptions.length <= 1 ? "No recruited retainer with this skill" : "Assign a retainer to run this slot"}
                        </div>
                      )}
                      {c.active && (
                        <div className="mt-1 text-xs text-gray-500">
                          {p?.job} L{c.level}
                          {c.estimated && <span className="text-amber-400"> · est</span>}
                        </div>
                      )}
                    </td>
                    <td className="td text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[#d9b25b]"
                        checked={line.bestSeller}
                        onChange={(e) => update(line.id, { bestSeller: e.target.checked })}
                      />
                    </td>
                    <td className="td text-right tabular-nums">{c.active ? fmt(c.outPerHr, 2) : "—"}</td>
                    <td className="td text-right tabular-nums">{c.innPrice || "—"}</td>
                    <td className="td text-right tabular-nums text-gray-400">{c.tradePrice || "—"}</td>
                    <td className="td text-right font-semibold">
                      <Money n={c.revenuePerHr} />
                    </td>
                    <td className="td text-right font-semibold">
                      <Money n={c.profitPerHr} />
                    </td>
                    <td className="td">
                      <div className="flex gap-1">
                        <button className="btn px-2 py-1" onClick={() => duplicate(line.id)} title="Duplicate">
                          ⧉
                        </button>
                        <button className="btn px-2 py-1" onClick={() => remove(line.id)} title="Remove">
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-line bg-panel2/40">
                <td className="td font-semibold" colSpan={6}>
                  Total ({plan.craftLines.length} slots)
                </td>
                <td className="td text-right font-bold">
                  <Money n={totRev} className="text-gold" />
                </td>
                <td className="td text-right font-bold">
                  <Money n={totProfit} className="text-jade" />
                </td>
                <td className="td" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-500">
        <span className="text-gray-300">Inn $</span> = automatic passive sale price ·{" "}
        <span className="text-gray-300">Trade $</span> = manual sell-to-NPC price (tracked on the Sell tab).
        Inn income/hr = output × Inn price; Profit = Inn income − input cost. Use ⧉ to duplicate a slot.
      </p>
    </div>
  );
}
